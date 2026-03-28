import type { AgentMessagePartRecord, AgentMessageWithParts } from "@lifecycle/contracts";
import type { AgentEvent } from "../events";
import type { AgentMessagePart, AgentMessageRole } from "../turn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PartEntry {
  id: string;
  part: AgentMessagePart;
}

export interface AccumulatedMessage {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  turnId: string | null;
  parts: PartEntry[];
  createdAt: string;
}

export interface AgentMessageProjectionResult {
  messages: AgentMessageWithParts[];
  flushed: AgentMessageWithParts[];
}

/**
 * Optional callback invoked whenever a message is flushed (created or updated).
 * The test harness and desktop app both use this to observe persistence writes.
 */
export type AgentMessageFlushCallback = (message: AgentMessageWithParts) => void;

/**
 * Optional callback invoked when the pipeline needs to check if an assistant
 * message was already persisted (e.g. from a previous app session).
 * Returns the part count for the given messageId.
 */
export type HasPersistedAgentMessageParts = (messageId: string) => Promise<number> | number;

// ---------------------------------------------------------------------------
// Pure message accumulation pipeline.
//
// This is the same logic that runs in the desktop agent host, extracted into
// a self-contained, testable unit.  It owns:
//   - message creation / get-or-create
//   - part accumulation (delta concatenation + completed replacement)
//   - text rendering (for the message's `.text` field)
//   - turn completion (empty-turn guard + eviction)
//   - synthetic message parts (tool results, approvals, artifacts)
// ---------------------------------------------------------------------------

export class AgentMessageProjection {
  private messages = new Map<string, AccumulatedMessage>();
  private messageSeq = new Map<string, number>();
  private flushed: AgentMessageWithParts[] = [];
  private onFlush: AgentMessageFlushCallback | null;
  private hasPersistedParts: HasPersistedAgentMessageParts | null;
  private now: () => string;

  constructor(options?: {
    now?: () => string;
    onFlush?: AgentMessageFlushCallback;
    hasPersistedParts?: HasPersistedAgentMessageParts;
  }) {
    this.onFlush = options?.onFlush ?? null;
    this.hasPersistedParts = options?.hasPersistedParts ?? null;
    this.now = options?.now ?? (() => "2026-01-01T00:00:00.000Z");
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Feed an agent event into the pipeline.  Returns the flushed message
   * (if any) so callers can inspect what was persisted.
   */
  async processEvent(event: AgentEvent): Promise<AgentMessageWithParts | null> {
    switch (event.kind) {
      case "agent.message.created": {
        const msg = this.getOrCreate(event.messageId, event.sessionId, event.role, event.turnId);
        return this.flush(msg);
      }

      case "agent.message.part.delta":
      case "agent.message.part.completed": {
        const msg = this.getOrCreate(
          event.messageId,
          event.sessionId,
          inferRole(event.messageId),
          inferTurnId(event.messageId),
        );
        appendPart(msg, event.partId, event.part, event.kind === "agent.message.part.delta");
        return this.flush(msg);
      }

      case "agent.tool_call.updated": {
        const msgId = `tool:${event.toolCall.id}`;
        const msg = this.getOrCreate(msgId, event.sessionId, "tool", null);
        appendPart(
          msg,
          `tool:${event.toolCall.id}:call`,
          {
            type: "tool_call",
            toolCallId: event.toolCall.id,
            toolName: event.toolCall.toolName,
            inputJson: JSON.stringify(event.toolCall.inputJson),
            outputJson: event.toolCall.outputJson
              ? JSON.stringify(event.toolCall.outputJson)
              : undefined,
            status: event.toolCall.status,
            errorText: event.toolCall.errorText ?? undefined,
          },
          false,
        );
        if (event.toolCall.outputJson || event.toolCall.errorText) {
          appendPart(
            msg,
            `tool:${event.toolCall.id}:result`,
            {
              type: "tool_result",
              toolCallId: event.toolCall.id,
              outputJson: event.toolCall.outputJson
                ? JSON.stringify(event.toolCall.outputJson)
                : undefined,
              errorText: event.toolCall.errorText ?? undefined,
            },
            false,
          );
        }
        return this.flush(msg);
      }

      case "agent.approval.requested": {
        const msgId = `approval:${event.approval.id}`;
        const msg = this.getOrCreate(msgId, event.sessionId, "system", null);
        appendPart(
          msg,
          `approval:${event.approval.id}:ref`,
          {
            type: "approval_ref",
            approvalId: event.approval.id,
            kind: event.approval.kind,
            message: event.approval.message,
            metadata: event.approval.metadata ?? undefined,
            status: event.approval.status,
          },
          false,
        );
        return this.flush(msg);
      }

      case "agent.approval.resolved": {
        const msgId = `approval:${event.resolution.approvalId}`;
        const msg = this.getOrCreate(msgId, event.sessionId, "system", null);
        appendPart(
          msg,
          `approval:${event.resolution.approvalId}:ref`,
          {
            type: "approval_ref",
            approvalId: event.resolution.approvalId,
            decision: event.resolution.decision,
            status:
              event.resolution.decision === "reject"
                ? "rejected"
                : event.resolution.decision === "approve_session"
                  ? "approved_session"
                  : "approved_once",
          },
          false,
        );
        return this.flush(msg);
      }

      case "agent.artifact.published": {
        const msgId = `artifact:${event.artifact.id}`;
        const msg = this.getOrCreate(msgId, event.sessionId, "system", null);
        appendPart(
          msg,
          `artifact:${event.artifact.id}:ref`,
          {
            type: "artifact_ref",
            artifactId: event.artifact.id,
            artifactType: event.artifact.artifactType,
            title: event.artifact.title,
            uri: event.artifact.uri,
          },
          false,
        );
        return this.flush(msg);
      }

      case "agent.turn.completed": {
        const assistantMsgId = `${event.turnId}:assistant`;
        let hasContent = this.messages.has(assistantMsgId);
        if (!hasContent && this.hasPersistedParts) {
          hasContent = (await this.hasPersistedParts(assistantMsgId)) > 0;
        }
        if (!hasContent) {
          const msg = this.getOrCreate(assistantMsgId, event.sessionId, "assistant", event.turnId);
          appendPart(
            msg,
            `${assistantMsgId}:empty`,
            { type: "text", text: "_No response._" },
            false,
          );
          this.flush(msg);
        }
        // Evict accumulated messages for this turn
        for (const [key, entry] of this.messages) {
          if (entry.turnId === event.turnId) {
            this.messages.delete(key);
          }
        }
        return null;
      }

      case "agent.turn.failed": {
        // Evict accumulated messages for this turn
        for (const [key, entry] of this.messages) {
          if (entry.turnId === event.turnId) {
            this.messages.delete(key);
          }
        }
        return null;
      }

      default:
        return null;
    }
  }

  /** Snapshot all accumulated messages (useful for assertions). */
  snapshot(): AgentMessageWithParts[] {
    return [...this.messages.values()].map(toMessageWithParts);
  }

  /** All messages that were flushed (persisted) during the pipeline's lifetime. */
  allFlushed(): AgentMessageWithParts[] {
    return this.flushed;
  }

  /** Return the last flushed version of a specific message by ID. */
  getFlushed(messageId: string): AgentMessageWithParts | undefined {
    // Walk backwards to find the most recent flush for this ID.
    for (let i = this.flushed.length - 1; i >= 0; i--) {
      if (this.flushed[i]!.id === messageId) return this.flushed[i];
    }
    return undefined;
  }

  /** Deduplicated final messages, last-flush-wins per messageId. */
  finalMessages(): AgentMessageWithParts[] {
    const map = new Map<string, AgentMessageWithParts>();
    for (const msg of this.flushed) {
      map.set(msg.id, msg);
    }
    return [...map.values()];
  }

  clearSession(sessionId: string): void {
    for (const [messageId, message] of this.messages) {
      if (message.sessionId === sessionId) {
        this.messages.delete(messageId);
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private getOrCreate(
    messageId: string,
    sessionId: string,
    role: AgentMessageRole,
    turnId: string | null,
  ): AccumulatedMessage {
    let msg = this.messages.get(messageId);
    if (!msg) {
      msg = {
        id: messageId,
        sessionId,
        role,
        turnId,
        parts: [],
        createdAt: this.nextTimestamp(sessionId),
      };
      this.messages.set(messageId, msg);
    } else {
      msg.role = role;
      msg.sessionId = sessionId;
      msg.turnId = msg.turnId ?? turnId;
    }
    return msg;
  }

  private nextTimestamp(sessionId: string): string {
    const seq = (this.messageSeq.get(sessionId) ?? 0) + 1;
    this.messageSeq.set(sessionId, seq);
    const base = this.now().replace("Z", "");
    return `${base}${String(seq).padStart(6, "0")}Z`;
  }

  private flush(msg: AccumulatedMessage): AgentMessageWithParts {
    const record = toMessageWithParts(msg);
    this.flushed.push(record);
    this.onFlush?.(record);
    return record;
  }
}

// ---------------------------------------------------------------------------
// Pure functions (shared with desktop agent host)
// ---------------------------------------------------------------------------

export function inferRole(messageId: string): AgentMessageRole {
  const segments = messageId.split(":");
  const candidate = segments[1];
  if (
    candidate === "user" ||
    candidate === "assistant" ||
    candidate === "system" ||
    candidate === "tool"
  ) {
    return candidate;
  }
  return "assistant";
}

export function inferTurnId(messageId: string): string | null {
  const first = messageId.split(":")[0];
  return first ?? null;
}

export function appendPart(
  msg: AccumulatedMessage,
  partId: string,
  part: AgentMessagePart,
  isDelta: boolean,
): void {
  const idx = msg.parts.findIndex((p) => p.id === partId);
  const existing = idx >= 0 ? msg.parts[idx]!.part : undefined;
  const isTextual = (v: AgentMessagePart): v is Extract<AgentMessagePart, { text: string }> =>
    v.type === "text" || v.type === "thinking" || v.type === "status";

  if (idx >= 0 && existing && isDelta) {
    if (isTextual(existing) && isTextual(part)) {
      msg.parts[idx] = { id: partId, part: { ...existing, text: existing.text + part.text } };
    } else {
      msg.parts[idx] = { id: partId, part };
    }
  } else if (idx >= 0 && existing && existing.type === part.type) {
    msg.parts[idx] = { id: partId, part: { ...existing, ...part } as AgentMessagePart };
  } else if (idx >= 0) {
    msg.parts[idx] = { id: partId, part };
  } else {
    msg.parts.push({ id: partId, part });
  }
}

export function renderText(msg: AccumulatedMessage): string {
  return msg.parts
    .map(({ part }) => {
      switch (part.type) {
        case "text":
        case "thinking":
        case "status":
          return part.text;
        default:
          return "";
      }
    })
    .join("")
    .trim();
}

function partDataFromPart(part: AgentMessagePart): string | null {
  const stringify = (obj: Record<string, unknown>) => JSON.stringify(obj);
  switch (part.type) {
    case "tool_call":
      return stringify({
        tool_call_id: part.toolCallId,
        tool_name: part.toolName,
        input_json: part.inputJson,
        output_json: part.outputJson,
        status: part.status,
        error_text: part.errorText,
      });
    case "tool_result":
      return stringify({
        tool_call_id: part.toolCallId,
        output_json: part.outputJson,
        error_text: part.errorText,
      });
    case "approval_ref":
      return stringify({
        approval_id: part.approvalId,
        decision: part.decision,
        kind: part.kind,
        message: part.message,
        metadata: "metadata" in part ? (part.metadata ?? null) : null,
        status: part.status,
      });
    case "artifact_ref":
      return stringify({
        artifact_id: part.artifactId,
        artifact_type: part.artifactType,
        title: part.title,
        uri: part.uri,
      });
    case "image":
      return stringify({
        media_type: part.mediaType,
        base64_data: part.base64Data,
      });
    default:
      return null;
  }
}

function toPartRecord(
  msg: AccumulatedMessage,
  entry: PartEntry,
  index: number,
): AgentMessagePartRecord {
  const p = entry.part;
  return {
    id: entry.id,
    message_id: msg.id,
    session_id: msg.sessionId,
    part_index: index,
    part_type: p.type,
    text: "text" in p && typeof p.text === "string" ? p.text : null,
    data: partDataFromPart(p),
    created_at: msg.createdAt,
  };
}

export function toMessageWithParts(msg: AccumulatedMessage): AgentMessageWithParts {
  return {
    id: msg.id,
    session_id: msg.sessionId,
    role: msg.role,
    text: renderText(msg),
    turn_id: msg.turnId,
    parts: msg.parts.map((entry, i) => toPartRecord(msg, entry, i)),
    created_at: msg.createdAt,
  };
}
