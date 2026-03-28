import {
  createAgentClient as createLifecycleAgentClient,
  type AgentEvent,
} from "@lifecycle/agents";
import type { AgentMessagePart } from "@lifecycle/agents";
import {
  insertAgentEvent,
  selectNextAgentEventIndex,
  selectAgentSessionById,
  upsertAgentMessageInCollection,
  upsertAgentSessionInCollection,
  upsertAgentMessageWithParts,
} from "@lifecycle/store";
import {
  stringifyAgentMessagePartData,
  type AgentMessagePartRecord,
  type AgentMessageRole,
  type AgentMessageWithParts,
  type AgentSessionRecord,
  type WorkspaceHost,
} from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace/client";
import { publishBrowserLifecycleEvent } from "@/features/events";
import { recordAgentSessionEvent } from "@lifecycle/agents/react";
import { db } from "@/lib/db";

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

// ---------------------------------------------------------------------------
// HMR preservation — keep in-flight message state across hot reloads
// ---------------------------------------------------------------------------
interface AgentClientHotState {
  accumulatedMessages: Map<string, AccumulatedMessage>;
  messageSequence: Map<string, number>;
  observedSessionMetadata: Map<string, ObservedSessionMetadata>;
  observedSessionQueues: Map<string, Promise<void>>;
  observedEventIndices: Map<string, number>;
}

const hotState = import.meta.hot?.data as Partial<AgentClientHotState> | undefined;

const accumulatedMessages: Map<string, AccumulatedMessage> =
  hotState?.accumulatedMessages ?? new Map();
const messageSequence: Map<string, number> = hotState?.messageSequence ?? new Map();
const observedSessionMetadata: Map<string, ObservedSessionMetadata> =
  hotState?.observedSessionMetadata ?? new Map();
const observedSessionQueues: Map<string, Promise<void>> = hotState?.observedSessionQueues ??
new Map();
const observedEventIndices: Map<string, number> = hotState?.observedEventIndices ?? new Map();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.accumulatedMessages = accumulatedMessages;
    data.messageSequence = messageSequence;
    data.observedSessionMetadata = observedSessionMetadata;
    data.observedSessionQueues = observedSessionQueues;
    data.observedEventIndices = observedEventIndices;
  });
}

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
    msg.sessionId = sessionId;
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
  upsertAgentMessageInCollection(db, msg.sessionId, record);
}

async function persistToSql(record: AgentMessageWithParts): Promise<void> {
  await upsertAgentMessageWithParts(db, record);
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

  const session = await selectAgentSessionById(db, sessionId);
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

async function nextObservedEventIndex(sessionId: string): Promise<number> {
  const cached = observedEventIndices.get(sessionId);
  if (typeof cached === "number") {
    const next = cached + 1;
    observedEventIndices.set(sessionId, next);
    return next;
  }

  const next = await selectNextAgentEventIndex(db, sessionId);
  observedEventIndices.set(sessionId, next);
  return next;
}

// High-frequency events that don't need durable event-sourcing. The message
// accumulator + flush already persists the final state for these.
const SKIP_PERSIST_EVENT_KINDS = new Set([
  "agent.message.part.delta",
  "agent.message.part.completed",
  "agent.status.updated",
]);

async function persistObservedEvent(event: AgentEvent): Promise<void> {
  const sessionId = eventSessionId(event);
  if (!sessionId) {
    return;
  }

  if (event.kind === "agent.session.created" || event.kind === "agent.session.updated") {
    cacheSessionMetadata(event.session);
  }

  // Skip persisting high-frequency streaming events to avoid unbounded
  // agent_event table growth and unnecessary SQL write pressure.
  if (SKIP_PERSIST_EVENT_KINDS.has(event.kind)) {
    return;
  }

  const metadata = await getObservedSessionMetadata(sessionId);
  if (!metadata) {
    return;
  }

  const eventIndex = await nextObservedEventIndex(sessionId);
  await insertAgentEvent(db, {
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
  const next = previous
    .catch((err) => {
      console.error("[agent] previous queued event failed for session", sessionId, err);
    })
    .then(task);
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

async function observeAgentEvent(event: Parameters<typeof recordAgentSessionEvent>[0]) {
  const sessionId = eventSessionId(event);
  const handle = async () => {
    try {
      // Update React state immediately so the UI reflects changes without
      // waiting for the SQL write. Persistence follows — if it fails the
      // error is logged but the UI stays responsive.
      recordAgentSessionEvent(event);
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
        await upsertAgentSessionInCollection(db, event.workspaceId, event.session);
        publishBrowserLifecycleEvent({
          kind: event.kind,
          workspaceId: event.workspaceId,
          session: event.session,
        });
      } else if (event.kind === "agent.turn.completed") {
        // If the model produced no assistant content for this turn, create a
        // minimal assistant message so the transcript isn't silently empty.
        // Check both the in-memory accumulator AND the DB — after an app
        // reload or WebSocket reconnect the in-memory map is empty even
        // though messages were already persisted by a previous connection.
        const assistantMsgId = `${event.turnId}:assistant`;
        let hasAssistantContent = accumulatedMessages.has(assistantMsgId);
        if (!hasAssistantContent) {
          const [row] = await db.select<{ cnt: number }>(
            "SELECT COUNT(*) AS cnt FROM agent_message_part WHERE message_id = $1",
            [assistantMsgId],
          );
          hasAssistantContent = (row?.cnt ?? 0) > 0;
        }
        if (!hasAssistantContent) {
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

        // Evict accumulated messages for this turn — they are fully persisted
        // to SQL by now, so keeping them wastes memory and risks stale
        // sessionId routing if IDs are ever reused across sessions.
        for (const [key, entry] of accumulatedMessages) {
          if (entry.turnId === event.turnId) {
            accumulatedMessages.delete(key);
          }
        }

        publishBrowserLifecycleEvent({
          kind: "agent.turn.completed",
          sessionId: event.sessionId,
          turnId: event.turnId,
          workspaceId: event.workspaceId,
        });
      } else if (event.kind === "agent.turn.failed") {
        // Evict accumulated messages for the failed turn as well.
        for (const [key, entry] of accumulatedMessages) {
          if (entry.turnId === event.turnId) {
            accumulatedMessages.delete(key);
          }
        }
      }

      // Clean up accumulated messages when a session reaches a terminal state.
      if (event.kind === "agent.session.updated") {
        const status = event.session.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          for (const [key, entry] of accumulatedMessages) {
            if (entry.sessionId === event.session.id) {
              accumulatedMessages.delete(key);
            }
          }
          observedSessionMetadata.delete(event.session.id);
        }
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

async function reattachPersistedAgentSessions(
  agentClient: ReturnType<typeof createLifecycleAgentClient>,
  workspaceHost: WorkspaceHost,
): Promise<void> {
  const sessions = await db.select<{ id: string }>(
    `SELECT agent_session.id AS id
       FROM agent_session
       INNER JOIN workspace ON workspace.id = agent_session.workspace_id
      WHERE workspace.host = $1
        AND agent_session.status NOT IN ('completed', 'failed', 'cancelled')`,
    [workspaceHost],
  );

  console.info(
    `[agent][${new Date().toISOString()}] reattaching persisted sessions ${JSON.stringify({ count: sessions.length })}`,
  );

  await Promise.all(
    sessions.map(async ({ id }) => {
      try {
        agentLog(id, "reattach requested");
        // Clear cached event index so the next persist queries the DB for the
        // true max — avoids stale indices after app restart or HMR.
        observedEventIndices.delete(id);
        await agentClient.attachSession(id);
        agentLog(id, "reattach completed");
      } catch (error) {
        console.error(`[agent] failed to reattach session ${id}:`, error);
      }
    }),
  );
}

export interface CreateDesktopAgentClientInput {
  agentWorker: Parameters<typeof createLifecycleAgentClient>[0]["agentWorker"];
  workspaceClient: WorkspaceClient;
  workspaceHost: WorkspaceHost;
}

export function createAgentClient({
  agentWorker,
  workspaceClient,
  workspaceHost,
}: CreateDesktopAgentClientInput) {
  const agentClient = createLifecycleAgentClient({
    agentWorker,
    driver: db,
    workspaceClient,
    workspaceHost,
    observers: [observeAgentEvent],
  });

  void reattachPersistedAgentSessions(agentClient, workspaceHost);
  return agentClient;
}
