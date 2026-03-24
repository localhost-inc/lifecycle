import {
  createAgentOrchestrator as createLifecycleAgentOrchestrator,
  type AgentEvent,
  type AgentWorkerEvent,
  type AgentWorker,
  type DetachedAgentHostSnapshot,
  type AgentSessionContext,
  type AgentSessionEvents,
} from "@lifecycle/agents";
import type { AgentEventObserver, AgentMessagePart, AgentToolCallStatus } from "@lifecycle/agents";
import {
  insertAgentEvent,
  selectNextAgentEventIndex,
  selectAgentSessionById,
  selectAgentSessionsByWorkspace,
  selectWorkspaceById,
  upsertAgentMessageWithParts,
  upsertAgentSession,
} from "@lifecycle/store";
import {
  stringifyAgentMessagePartData,
  type AgentMessagePartRecord,
  type AgentMessageRole,
  type AgentMessageWithParts,
  type AgentSessionRecord,
} from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import { publishBrowserLifecycleEvent } from "@/features/events";
import { createDetachedWorkerClient } from "@/features/agents/detached-worker-client";
import { recordAgentEvent } from "@/features/agents/state/agent-session-state";
import { parseSettingsJson } from "@/features/settings/state/settings-provider";
import { readAppSettings } from "@/lib/config";
import { tauriSqlDriver } from "@/lib/sql-driver";
import { upsertAgentMessageInCollection } from "@/store/collections/agent-messages";
import { upsertAgentSessionInCollection } from "@/store/collections/agent-sessions";

// ---------------------------------------------------------------------------
// Message parts accumulator — write-through to DB, no React state.
// ---------------------------------------------------------------------------

interface PartEntry {
  id: string;
  part: AgentMessagePart;
}

interface AccumulatedMessage {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  turnId: string | null;
  parts: PartEntry[];
  createdAt: string;
}

interface ObservedSessionMetadata {
  provider: AgentSessionRecord["provider"];
  providerSessionId: AgentSessionRecord["provider_session_id"];
  workspaceId: AgentSessionRecord["workspace_id"];
}

const accumulatedMessages = new Map<string, AccumulatedMessage>();
const messageSequence = new Map<string, number>();
const observedSessionMetadata = new Map<string, ObservedSessionMetadata>();
const observedSessionQueues = new Map<string, Promise<void>>();
const observedEventIndices = new Map<string, number>();

function agentLog(sessionId: string, message: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[agent][${timestamp}][${sessionId}] ${message}${suffix}`);
}

function nextMessageTimestamp(sessionId: string): string {
  const seq = (messageSequence.get(sessionId) ?? 0) + 1;
  messageSequence.set(sessionId, seq);
  const base = new Date().toISOString().replace("Z", "");
  return `${base}${String(seq).padStart(6, "0")}Z`;
}

function getOrCreateMessage(
  messageId: string,
  sessionId: string,
  role: AgentMessageRole,
  turnId: string | null,
): AccumulatedMessage {
  let msg = accumulatedMessages.get(messageId);
  if (!msg) {
    msg = {
      id: messageId,
      sessionId,
      role,
      turnId,
      parts: [],
      createdAt: nextMessageTimestamp(sessionId),
    };
    accumulatedMessages.set(messageId, msg);
  } else {
    msg.role = role;
    msg.turnId = msg.turnId ?? turnId;
  }
  return msg;
}

function appendPart(
  msg: AccumulatedMessage,
  partId: string,
  part: AgentMessagePart,
  isDelta: boolean,
): void {
  const idx = msg.parts.findIndex((p) => p.id === partId);
  const existing = idx >= 0 ? msg.parts[idx]!.part : undefined;
  const isTextualPart = (
    value: AgentMessagePart,
  ): value is Extract<AgentMessagePart, { text: string }> =>
    value.type === "text" || value.type === "thinking" || value.type === "status";

  if (idx >= 0 && existing && isDelta) {
    if (isTextualPart(existing) && isTextualPart(part)) {
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

function renderText(msg: AccumulatedMessage): string {
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
  switch (part.type) {
    case "tool_call":
      return stringifyAgentMessagePartData({
        tool_call_id: part.toolCallId,
        tool_name: part.toolName,
        input_json: part.inputJson,
        output_json: part.outputJson,
        status: part.status,
        error_text: part.errorText,
      });
    case "tool_result":
      return stringifyAgentMessagePartData({
        tool_call_id: part.toolCallId,
        output_json: part.outputJson,
        error_text: part.errorText,
      });
    case "attachment_ref":
      return stringifyAgentMessagePartData({
        attachment_id: part.attachmentId,
      });
    case "approval_ref":
      return stringifyAgentMessagePartData({
        approval_id: part.approvalId,
        decision: part.decision,
        kind: part.kind,
        message: part.message,
        metadata: "metadata" in part ? (part.metadata ?? null) : null,
        status: part.status,
      });
    case "artifact_ref":
      return stringifyAgentMessagePartData({
        artifact_id: part.artifactId,
        artifact_type: part.artifactType,
        title: part.title,
        uri: part.uri,
      });
    case "image":
      return stringifyAgentMessagePartData({
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

function toMessageWithParts(msg: AccumulatedMessage): AgentMessageWithParts {
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

/**
 * Persist a message to SQL first, then push the durable row into the live collection.
 */
async function flushMessage(msg: AccumulatedMessage): Promise<void> {
  const record = toMessageWithParts(msg);
  await persistToSql(record);
  upsertAgentMessageInCollection(tauriSqlDriver, msg.sessionId, record);
}

async function persistToSql(record: AgentMessageWithParts): Promise<void> {
  await upsertAgentMessageWithParts(tauriSqlDriver, record);
}

function cacheSessionMetadata(session: AgentSessionRecord): void {
  observedSessionMetadata.set(session.id, {
    workspaceId: session.workspace_id,
    provider: session.provider,
    providerSessionId: session.provider_session_id,
  });
}

async function getObservedSessionMetadata(
  sessionId: string,
): Promise<ObservedSessionMetadata | null> {
  const cached = observedSessionMetadata.get(sessionId);
  if (cached) {
    return cached;
  }

  const session = await selectAgentSessionById(tauriSqlDriver, sessionId);
  if (!session) {
    return null;
  }

  cacheSessionMetadata(session);
  return observedSessionMetadata.get(sessionId) ?? null;
}

function eventSessionId(event: AgentEvent): string | null {
  if (event.kind === "agent.session.created" || event.kind === "agent.session.updated") {
    return event.session.id;
  }

  if ("sessionId" in event) {
    return event.sessionId;
  }

  return null;
}

function eventTurnId(event: AgentEvent): string | null {
  switch (event.kind) {
    case "agent.turn.started":
    case "agent.turn.completed":
    case "agent.turn.failed":
      return event.turnId;
    case "agent.message.created":
      return event.turnId;
    default:
      return null;
  }
}

function inferMessageRole(messageId: string): AgentMessageRole {
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

function inferMessageTurnId(messageId: string): string | null {
  const separator = messageId.indexOf(":");
  if (separator <= 0) {
    return null;
  }

  return messageId.slice(0, separator);
}

function mapWorkerItemStatus(status: "in_progress" | "completed" | "failed"): AgentToolCallStatus {
  switch (status) {
    case "in_progress":
      return "running";
    case "failed":
      return "failed";
    case "completed":
    default:
      return "completed";
  }
}

function parseWorkerJsonRecord(value: string | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { value };
  }
}

async function nextObservedEventIndex(sessionId: string): Promise<number> {
  const cached = observedEventIndices.get(sessionId);
  if (typeof cached === "number") {
    const next = cached + 1;
    observedEventIndices.set(sessionId, next);
    return next;
  }

  const next = await selectNextAgentEventIndex(tauriSqlDriver, sessionId);
  observedEventIndices.set(sessionId, next);
  return next;
}

async function persistObservedEvent(event: AgentEvent): Promise<void> {
  const sessionId = eventSessionId(event);
  if (!sessionId) {
    return;
  }

  if (event.kind === "agent.session.created" || event.kind === "agent.session.updated") {
    cacheSessionMetadata(event.session);
  }

  const metadata = await getObservedSessionMetadata(sessionId);
  if (!metadata) {
    return;
  }

  const eventIndex = await nextObservedEventIndex(sessionId);
  await insertAgentEvent(tauriSqlDriver, {
    id: `${sessionId}:event:${String(eventIndex).padStart(6, "0")}`,
    session_id: sessionId,
    workspace_id: metadata.workspaceId,
    provider: metadata.provider,
    provider_session_id: metadata.providerSessionId,
    turn_id: eventTurnId(event),
    event_index: eventIndex,
    event_kind: event.kind,
    payload: JSON.stringify(event),
    created_at: new Date().toISOString(),
  });
}

function enqueueObservedEvent(sessionId: string, task: () => Promise<void>): Promise<void> {
  const previous = observedSessionQueues.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  observedSessionQueues.set(sessionId, next);
  return next.finally(() => {
    if (observedSessionQueues.get(sessionId) === next) {
      observedSessionQueues.delete(sessionId);
    }
  });
}

async function flushSyntheticMessagePart(input: {
  messageId: string;
  partId: string;
  part: AgentMessagePart;
  role: AgentMessageRole;
  sessionId: string;
  turnId?: string | null;
}): Promise<void> {
  const msg = getOrCreateMessage(
    input.messageId,
    input.sessionId,
    input.role,
    input.turnId ?? null,
  );
  appendPart(msg, input.partId, input.part, false);
  await flushMessage(msg);
}

// ---------------------------------------------------------------------------
// Event observer — routes events to session state + message DB.
// ---------------------------------------------------------------------------

async function observeAgentEvent(event: Parameters<typeof recordAgentEvent>[0]) {
  const sessionId = eventSessionId(event);
  const handle = async () => {
    try {
      recordAgentEvent(event);
      await persistObservedEvent(event);

      if (event.kind === "agent.message.created") {
        const msg = getOrCreateMessage(event.messageId, event.sessionId, event.role, event.turnId);
        await flushMessage(msg);
      }

      if (
        event.kind === "agent.message.part.delta" ||
        event.kind === "agent.message.part.completed"
      ) {
        const msg = getOrCreateMessage(
          event.messageId,
          event.sessionId,
          inferMessageRole(event.messageId),
          inferMessageTurnId(event.messageId),
        );
        appendPart(msg, event.partId, event.part, event.kind === "agent.message.part.delta");
        await flushMessage(msg);
      }

      if (event.kind === "agent.tool_call.updated") {
        const inputJson = JSON.stringify(event.toolCall.inputJson);
        await flushSyntheticMessagePart({
          messageId: `tool:${event.toolCall.id}`,
          partId: `tool:${event.toolCall.id}:call`,
          part: {
            type: "tool_call",
            toolCallId: event.toolCall.id,
            toolName: event.toolCall.toolName,
            inputJson,
            outputJson: event.toolCall.outputJson
              ? JSON.stringify(event.toolCall.outputJson)
              : undefined,
            status: event.toolCall.status,
            errorText: event.toolCall.errorText ?? undefined,
          },
          role: "tool",
          sessionId: event.sessionId,
        });

        if (event.toolCall.outputJson || event.toolCall.errorText) {
          await flushSyntheticMessagePart({
            messageId: `tool:${event.toolCall.id}`,
            partId: `tool:${event.toolCall.id}:result`,
            part: {
              type: "tool_result",
              toolCallId: event.toolCall.id,
              outputJson: event.toolCall.outputJson
                ? JSON.stringify(event.toolCall.outputJson)
                : undefined,
              errorText: event.toolCall.errorText ?? undefined,
            },
            role: "tool",
            sessionId: event.sessionId,
          });
        }
      }

      if (event.kind === "agent.approval.requested") {
        await flushSyntheticMessagePart({
          messageId: `approval:${event.approval.id}`,
          partId: `approval:${event.approval.id}:ref`,
          part: {
            type: "approval_ref",
            approvalId: event.approval.id,
            kind: event.approval.kind,
            message: event.approval.message,
            metadata: event.approval.metadata ?? undefined,
            status: event.approval.status,
          },
          role: "system",
          sessionId: event.sessionId,
        });
      }

      if (event.kind === "agent.approval.resolved") {
        await flushSyntheticMessagePart({
          messageId: `approval:${event.resolution.approvalId}`,
          partId: `approval:${event.resolution.approvalId}:ref`,
          part: {
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
          role: "system",
          sessionId: event.sessionId,
        });
      }

      if (event.kind === "agent.artifact.published") {
        await flushSyntheticMessagePart({
          messageId: `artifact:${event.artifact.id}`,
          partId: `artifact:${event.artifact.id}:ref`,
          part: {
            type: "artifact_ref",
            artifactId: event.artifact.id,
            artifactType: event.artifact.artifactType,
            title: event.artifact.title,
            uri: event.artifact.uri,
          },
          role: "system",
          sessionId: event.sessionId,
        });
      }

      if (event.kind === "agent.session.created" || event.kind === "agent.session.updated") {
        upsertAgentSessionInCollection(tauriSqlDriver, event.workspaceId, event.session);
        publishBrowserLifecycleEvent({
          kind: event.kind,
          workspaceId: event.workspaceId,
          session: event.session,
        });
      } else if (event.kind === "agent.turn.completed") {
        // If the model produced no assistant content for this turn, create a
        // minimal assistant message so the transcript isn't silently empty.
        const assistantMsgId = `${event.turnId}:assistant`;
        if (!accumulatedMessages.has(assistantMsgId)) {
          const msg = getOrCreateMessage(
            assistantMsgId,
            event.sessionId,
            "assistant",
            event.turnId,
          );
          appendPart(
            msg,
            `${assistantMsgId}:empty`,
            { type: "text", text: "_No response._" },
            false,
          );
          await flushMessage(msg);
        }

        publishBrowserLifecycleEvent({
          kind: "agent.turn.completed",
          sessionId: event.sessionId,
          turnId: event.turnId,
          workspaceId: event.workspaceId,
        });
      }
    } catch (error) {
      console.error("[agent] observeAgentEvent failed:", event.kind, error);
    }
  };

  if (!sessionId) {
    await handle();
    return;
  }

  await enqueueObservedEvent(sessionId, handle);
}

function normalizeClaudePermissionMode(permissionMode: string): string {
  if (permissionMode === "auto") {
    return "default";
  }

  return permissionMode;
}

async function emitWorkerEvent(
  event: AgentWorkerEvent,
  sessionId: string,
  workspaceId: string,
  emit: AgentEventObserver,
): Promise<void> {
  switch (event.kind) {
    // --- Streaming deltas ---
    case "agent.message.delta":
      await emit({
        kind: "agent.message.part.delta",
        messageId: `${event.turnId}:assistant`,
        part: { type: "text", text: event.text },
        partId: `${event.turnId}:assistant:${event.blockId}`,
        sessionId,
        workspaceId,
      });
      return;
    case "agent.thinking.delta":
      await emit({
        kind: "agent.message.part.delta",
        messageId: `${event.turnId}:assistant`,
        part: { type: "thinking", text: event.text },
        partId: `${event.turnId}:assistant:${event.blockId}`,
        sessionId,
        workspaceId,
      });
      return;
    case "agent.tool_use.start":
      await emit({
        kind: "agent.message.part.delta",
        messageId: `${event.turnId}:assistant`,
        part: { type: "tool_call", toolCallId: event.toolUseId, toolName: event.toolName },
        partId: `${event.turnId}:assistant:tool:${event.toolUseId}`,
        sessionId,
        workspaceId,
      });
      return;
    case "agent.tool_use.input":
      await emit({
        kind: "agent.message.part.completed",
        messageId: `${event.turnId}:assistant`,
        part: {
          type: "tool_call",
          toolCallId: event.toolUseId,
          toolName: event.toolName,
          inputJson: event.inputJson,
        },
        partId: `${event.turnId}:assistant:tool:${event.toolUseId}`,
        sessionId,
        workspaceId,
      });
      return;
    case "agent.tool_progress":
      await emit({
        kind: "agent.message.part.delta",
        messageId: `${event.turnId}:assistant`,
        part: {
          type: "status",
          text: `${event.toolName} (${Math.round(event.elapsedTimeSeconds)}s)`,
        },
        partId: `${event.turnId}:assistant:tool:${event.toolUseId}:progress`,
        sessionId,
        workspaceId,
      });
      return;

    // --- Item lifecycle ---
    case "agent.item.completed":
    case "agent.item.started":
    case "agent.item.updated":
      switch (event.item.type) {
        case "agent_message":
          await emit({
            kind: "agent.message.created",
            messageId: `${event.turnId}:assistant:item:${event.item.id}`,
            role: "assistant",
            sessionId,
            turnId: event.turnId,
            workspaceId,
          });
          await emit({
            kind: "agent.message.part.completed",
            messageId: `${event.turnId}:assistant:item:${event.item.id}`,
            part: { type: "text", text: event.item.text },
            partId: `${event.turnId}:assistant:item:${event.item.id}:text`,
            sessionId,
            workspaceId,
          });
          return;
        case "reasoning":
          await emit({
            kind: "agent.message.created",
            messageId: `${event.turnId}:assistant:reasoning:${event.item.id}`,
            role: "assistant",
            sessionId,
            turnId: event.turnId,
            workspaceId,
          });
          await emit({
            kind: "agent.message.part.completed",
            messageId: `${event.turnId}:assistant:reasoning:${event.item.id}`,
            part: { type: "thinking", text: event.item.text },
            partId: `${event.turnId}:assistant:reasoning:${event.item.id}:thinking`,
            sessionId,
            workspaceId,
          });
          return;
        case "tool_call":
          await emit({
            kind: "agent.message.part.completed",
            messageId: `${event.turnId}:assistant`,
            part: {
              type: "tool_call",
              toolCallId: event.item.toolCallId,
              toolName: event.item.toolName,
              inputJson: event.item.inputJson,
              outputJson: event.item.outputJson,
              status: mapWorkerItemStatus(event.item.status),
              errorText: event.item.errorText,
            },
            partId: `${event.turnId}:assistant:tool:${event.item.toolCallId}`,
            sessionId,
            workspaceId,
          });
          return;
        case "command_execution":
          await emit({
            kind: "agent.message.part.completed",
            messageId: `${event.turnId}:assistant`,
            part: {
              type: "tool_call",
              toolCallId: event.item.id,
              toolName: "command_execution",
              inputJson: JSON.stringify({ command: event.item.command }),
              outputJson: JSON.stringify({
                command: event.item.command,
                exitCode: event.item.exitCode ?? null,
                output: event.item.output,
              }),
              status: mapWorkerItemStatus(event.item.status),
              errorText: event.item.status === "failed" ? event.item.output : undefined,
            },
            partId: `${event.turnId}:assistant:tool:${event.item.id}`,
            sessionId,
            workspaceId,
          });
          return;
        case "file_change":
          if (event.item.changes.length === 0) {
            await emit({
              kind: "agent.message.part.completed",
              messageId: `${event.turnId}:assistant`,
              part: {
                type: "tool_call",
                toolCallId: event.item.id,
                toolName: "file_change",
                inputJson: JSON.stringify({
                  changes: event.item.changes,
                  diff: event.item.diff ?? null,
                }),
                status: mapWorkerItemStatus(event.item.status),
              },
              partId: `${event.turnId}:assistant:tool:${event.item.id}`,
              sessionId,
              workspaceId,
            });
            return;
          }

          for (const [index, change] of event.item.changes.entries()) {
            const toolName =
              change.kind === "delete" ? "Delete" : change.kind === "add" ? "Write" : "Edit";
            await emit({
              kind: "agent.message.part.completed",
              messageId: `${event.turnId}:assistant`,
              part: {
                type: "tool_call",
                toolCallId: `${event.item.id}:${index}`,
                toolName,
                inputJson: JSON.stringify({
                  changeKind: change.kind,
                  diff: change.diff ?? null,
                  filePath: change.path,
                }),
                status: mapWorkerItemStatus(event.item.status),
              },
              partId: `${event.turnId}:assistant:tool:${event.item.id}:${index}`,
              sessionId,
              workspaceId,
            });
          }
          return;
        case "error":
          await emit({
            kind: "agent.tool_call.updated",
            sessionId,
            toolCall: {
              errorText: event.item.message,
              id: event.item.id,
              inputJson: { message: event.item.message },
              outputJson: null,
              sessionId,
              status: "failed",
              toolName: "error",
            },
            workspaceId,
          });
          return;
      }
      return;

    // --- Status ---
    case "agent.approval.requested":
      await emit({
        kind: "agent.approval.requested",
        sessionId,
        workspaceId,
        approval: {
          ...event.approval,
          sessionId,
        },
      });
      return;
    case "agent.approval.resolved":
      await emit({
        kind: "agent.approval.resolved",
        sessionId,
        workspaceId,
        resolution: {
          ...event.resolution,
          sessionId,
        },
      });
      return;
    case "agent.status":
      await emit({
        kind: "agent.status.updated",
        sessionId,
        workspaceId,
        status: event.status,
        detail: event.detail ?? null,
      });
      return;

    // --- Turn lifecycle ---
    case "agent.turn.completed":
      await emit({
        kind: "agent.turn.completed",
        sessionId,
        turnId: event.turnId,
        workspaceId,
        usage: event.usage,
        costUsd: event.costUsd,
      });
      return;
    case "agent.turn.failed":
      await emit({
        kind: "agent.turn.failed",
        error: event.error,
        sessionId,
        turnId: event.turnId,
        workspaceId,
      });
      return;

    // --- Auth ---
    case "worker.auth_status":
      await emit({
        kind: "agent.auth.updated",
        provider: "claude",
        authenticated: !event.isAuthenticating && !event.error,
        mode: event.isAuthenticating ? "authenticating" : event.error ? "error" : "ready",
        sessionId,
        workspaceId,
      });
      return;
    case "worker.ready":
      return;

    // --- Session metadata ---
    case "worker.title_generated": {
      const session = await selectAgentSessionById(tauriSqlDriver, sessionId);
      if (session && !session.title?.trim()) {
        const updatedSession: AgentSessionRecord = {
          ...session,
          title: event.title,
          updated_at: new Date().toISOString(),
        };
        await upsertAgentSession(tauriSqlDriver, updatedSession);
        cacheSessionMetadata(updatedSession);
        await emit({
          kind: "agent.session.updated",
          session: updatedSession,
          workspaceId,
        });
      }
      return;
    }
    default:
      return;
  }
}

async function updateSessionProviderBinding(
  session: AgentSessionRecord,
  providerSessionId: string,
  runtimeName: string,
  emit: AgentEventObserver,
): Promise<AgentSessionRecord> {
  agentLog(session.id, "updating provider binding", {
    nextProviderSessionId: providerSessionId,
    previousProviderSessionId: session.provider_session_id,
    runtimeName,
  });
  const nextSession: AgentSessionRecord = {
    ...session,
    provider_session_id: providerSessionId,
    runtime_name: runtimeName,
  };
  await upsertAgentSession(tauriSqlDriver, nextSession);
  upsertAgentSessionInCollection(tauriSqlDriver, nextSession.workspace_id, nextSession);
  cacheSessionMetadata(nextSession);
  await emit({
    kind: "agent.session.updated",
    session: nextSession,
    workspaceId: session.workspace_id,
  });

  return nextSession;
}

async function applyWorkerStateSnapshot(
  session: AgentSessionRecord,
  snapshot: DetachedAgentHostSnapshot,
  emit: AgentEventObserver,
): Promise<AgentSessionRecord> {
  agentLog(session.id, "applying worker state snapshot", {
    activeTurnId: snapshot.activeTurnId,
    nextProviderSessionId: snapshot.providerSessionId,
    nextStatus: snapshot.status,
    pendingApprovalId: snapshot.pendingApproval?.id ?? null,
    previousProviderSessionId: session.provider_session_id,
    previousStatus: session.status,
  });
  const nextStatus = snapshot.status === "starting" ? session.status : snapshot.status;
  const providerSessionId =
    snapshot.providerSessionId?.trim() && snapshot.providerSessionId !== session.provider_session_id
      ? snapshot.providerSessionId.trim()
      : session.provider_session_id;

  const nextSession: AgentSessionRecord = {
    ...session,
    provider_session_id: providerSessionId,
    runtime_name: session.provider,
    status: nextStatus,
  };

  if (
    nextSession.provider_session_id === session.provider_session_id &&
    nextSession.runtime_name === session.runtime_name &&
    nextSession.status === session.status
  ) {
    return session;
  }

  await upsertAgentSession(tauriSqlDriver, nextSession);
  upsertAgentSessionInCollection(tauriSqlDriver, nextSession.workspace_id, nextSession);
  cacheSessionMetadata(nextSession);
  await emit({
    kind: "agent.session.updated",
    session: nextSession,
    workspaceId: nextSession.workspace_id,
  });
  return nextSession;
}

async function launchDetachedProviderWorker(options: {
  emit: AgentEventObserver;
  launchArgs: string[];
  session: AgentSessionRecord;
  worktreePath: string;
}): Promise<{ session: AgentSessionRecord; worker: AgentWorker }> {
  let observedSession = options.session;
  agentLog(observedSession.id, "launching detached provider worker", {
    provider: observedSession.provider,
    worktreePath: options.worktreePath,
  });
  const worker = await createDetachedWorkerClient({
    cwd: options.worktreePath,
    launchArgs: options.launchArgs,
    onState: async (snapshot) => {
      if (
        snapshot.sessionId !== observedSession.id ||
        snapshot.provider !== observedSession.provider
      ) {
        agentLog(observedSession.id, "ignoring mismatched worker snapshot", {
          snapshotProvider: snapshot.provider,
          snapshotSessionId: snapshot.sessionId,
        });
        return;
      }
      observedSession = await applyWorkerStateSnapshot(observedSession, snapshot, options.emit);
    },
    onWorkerEvent: async (event) => {
      agentLog(observedSession.id, "processing worker event", {
        eventKind: event.kind,
        turnId: "turnId" in event ? event.turnId : null,
      });
      if (event.kind === "worker.ready") {
        observedSession = await updateSessionProviderBinding(
          observedSession,
          event.providerSessionId,
          observedSession.provider,
          options.emit,
        );
        return;
      }

      await emitWorkerEvent(event, observedSession.id, observedSession.workspace_id, options.emit);
    },
    sessionId: options.session.id,
  });

  return {
    session: observedSession,
    worker,
  };
}

async function buildClaudeHostArgs(
  session: AgentSessionRecord,
  worktreePath: string,
): Promise<string[]> {
  const settings = parseSettingsJson(await readAppSettings());
  const claudeSettings = settings.harnesses.claude;
  const args = [
    "--provider",
    "claude",
    "--session-id",
    session.id,
    "--workspace-path",
    worktreePath,
    "--model",
    claudeSettings.model,
    "--permission-mode",
    normalizeClaudePermissionMode(claudeSettings.permissionMode),
    "--login-method",
    claudeSettings.loginMethod ?? "claudeai",
  ];

  if (claudeSettings.dangerousSkipPermissions) {
    args.push("--dangerous-skip-permissions");
  }
  if (claudeSettings.effort !== "default") {
    args.push("--effort", claudeSettings.effort);
  }
  if (session.provider_session_id?.trim()) {
    args.push("--provider-session-id", session.provider_session_id.trim());
  }

  return args;
}

async function buildCodexHostArgs(
  session: AgentSessionRecord,
  worktreePath: string,
): Promise<string[]> {
  const settings = parseSettingsJson(await readAppSettings());
  const codexSettings = settings.harnesses.codex;
  const args = [
    "--provider",
    "codex",
    "--session-id",
    session.id,
    "--workspace-path",
    worktreePath,
    "--model",
    codexSettings.model,
    "--approval-policy",
    codexSettings.approvalPolicy,
    "--sandbox-mode",
    codexSettings.sandboxMode,
  ];

  if (codexSettings.dangerousBypass) {
    args.push("--dangerous-bypass");
  }
  if (codexSettings.reasoningEffort !== "default") {
    args.push("--model-reasoning-effort", codexSettings.reasoningEffort);
  }
  if (session.provider_session_id?.trim()) {
    args.push("--provider-session-id", session.provider_session_id.trim());
  }

  return args;
}

const ClaudeAgentWorker = {
  async start(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    _runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<{ session: AgentSessionRecord; worker: AgentWorker }> {
    if (!context.worktreePath) {
      throw new Error(`Workspace ${session.workspace_id} has no worktree path for Claude.`);
    }

    return await launchDetachedProviderWorker({
      emit: events.emit,
      launchArgs: await buildClaudeHostArgs(session, context.worktreePath),
      session: { ...session, runtime_name: "claude" },
      worktreePath: context.worktreePath,
    });
  },

  async connect(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    _runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<AgentWorker> {
    if (!context.worktreePath) {
      throw new Error(`Workspace ${session.workspace_id} has no worktree path for Claude.`);
    }

    const result = await launchDetachedProviderWorker({
      emit: events.emit,
      launchArgs: await buildClaudeHostArgs(session, context.worktreePath),
      session,
      worktreePath: context.worktreePath,
    });
    return result.worker;
  },
};

const CodexAgentWorker = {
  async start(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    _runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<{ session: AgentSessionRecord; worker: AgentWorker }> {
    if (!context.worktreePath) {
      throw new Error(`Workspace ${session.workspace_id} has no worktree path for Codex.`);
    }

    return await launchDetachedProviderWorker({
      emit: events.emit,
      launchArgs: await buildCodexHostArgs(session, context.worktreePath),
      session: { ...session, runtime_name: "codex" },
      worktreePath: context.worktreePath,
    });
  },

  async connect(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    _runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<AgentWorker> {
    if (!context.worktreePath) {
      throw new Error(`Workspace ${session.workspace_id} has no worktree path for Codex.`);
    }

    const result = await launchDetachedProviderWorker({
      emit: events.emit,
      launchArgs: await buildCodexHostArgs(session, context.worktreePath),
      session,
      worktreePath: context.worktreePath,
    });
    return result.worker;
  },
};

async function reattachPersistedAgentSessions(
  orchestrator: ReturnType<typeof createLifecycleAgentOrchestrator>,
): Promise<void> {
  const sessions = await tauriSqlDriver.select<{ id: string }>(
    "SELECT id FROM agent_session WHERE ended_at IS NULL",
  );

  console.info(
    `[agent][${new Date().toISOString()}] reattaching persisted sessions ${JSON.stringify({ count: sessions.length })}`,
  );

  await Promise.all(
    sessions.map(async ({ id }) => {
      try {
        agentLog(id, "reattach requested");
        await orchestrator.attachSession(id);
        agentLog(id, "reattach completed");
      } catch (error) {
        console.error(`[agent] failed to reattach session ${id}:`, error);
      }
    }),
  );
}

export function createAgentOrchestrator(localRuntime: WorkspaceRuntime) {
  const orchestrator = createLifecycleAgentOrchestrator({
    workers: {
      claude: ClaudeAgentWorker,
      codex: CodexAgentWorker,
    },
    resolveRuntime() {
      return localRuntime;
    },
    store: {
      async saveSession(session) {
        await upsertAgentSession(tauriSqlDriver, session);
        upsertAgentSessionInCollection(tauriSqlDriver, session.workspace_id, session);
        return session;
      },
      async getSession(agentSessionId) {
        return (await selectAgentSessionById(tauriSqlDriver, agentSessionId)) ?? null;
      },
      listSessions(workspaceId) {
        return selectAgentSessionsByWorkspace(tauriSqlDriver, workspaceId);
      },
      async getWorkspace(workspaceId) {
        const workspaceRecord = await selectWorkspaceById(tauriSqlDriver, workspaceId);
        if (!workspaceRecord) {
          return null;
        }

        return {
          workspaceId,
          workspaceTarget: workspaceRecord.target,
          worktreePath: workspaceRecord.worktree_path,
        };
      },
    },
    observers: [observeAgentEvent],
  });

  void reattachPersistedAgentSessions(orchestrator);
  return orchestrator;
}
