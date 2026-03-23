import {
  createAgentOrchestrator as createLifecycleAgentOrchestrator,
  type AgentWorkerCommand,
  type AgentEvent,
  type AgentWorkerEvent,
  type AgentWorker as AgentWorkerContract,
  type AgentWorkerLauncher,
  type AgentApprovalResolution,
  type AgentSessionContext,
  type AgentSessionEvents,
  type AgentTurnCancelRequest,
  type AgentTurnRequest,
} from "@lifecycle/agents";
import type { AgentEventObserver, AgentMessagePart, AgentToolCallStatus } from "@lifecycle/agents";
import type { AgentSessionProviderId } from "@lifecycle/contracts";
import { Command, type Child } from "@tauri-apps/plugin-shell";
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
import { recordAgentEvent } from "@/features/agents/state/agent-session-state";
import { parseSettingsJson } from "@/features/settings/state/settings-provider";
import { readAppSettings } from "@/lib/config";
import { tauriSqlDriver } from "@/lib/sql-driver";
import { upsertAgentMessageInCollection } from "@/store/collections/agent-messages";
import { refreshAgentSessionCollection } from "@/store/collections/agent-sessions";

// ---------------------------------------------------------------------------
// Message parts accumulator — write-through to DB, no React state.
// ---------------------------------------------------------------------------

interface PartEntry {
  id: string;
  part: AgentMessagePart;
}

interface AccumulatedMessage {
  id: string;
  session_id: string;
  role: AgentMessageRole;
  turn_id: string | null;
  parts: PartEntry[];
  created_at: string;
}

const accumulatedMessages = new Map<string, AccumulatedMessage>();
const messageSequence = new Map<string, number>();
const observedSessionMetadata = new Map<
  string,
  Pick<AgentSessionRecord, "workspace_id" | "provider" | "provider_session_id">
>();
const observedSessionQueues = new Map<string, Promise<void>>();
const observedEventIndices = new Map<string, number>();

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
      session_id: sessionId,
      role,
      turn_id: turnId,
      parts: [],
      created_at: nextMessageTimestamp(sessionId),
    };
    accumulatedMessages.set(messageId, msg);
  } else {
    msg.role = role;
    msg.turn_id = msg.turn_id ?? turnId;
  }
  return msg;
}

function appendPart(msg: AccumulatedMessage, partId: string, part: AgentMessagePart, isDelta: boolean): void {
  const idx = msg.parts.findIndex((p) => p.id === partId);
  const existing = idx >= 0 ? msg.parts[idx]!.part : undefined;
  const isTextualPart = (value: AgentMessagePart): value is Extract<AgentMessagePart, { text: string }> =>
    value.type === "text" || value.type === "thinking" || value.type === "status";

  if (idx >= 0 && existing && isDelta) {
    if (
      isTextualPart(existing) &&
      isTextualPart(part)
    ) {
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
        tool_call_id: part.tool_call_id,
        tool_name: part.tool_name,
        input_json: part.input_json,
        output_json: part.output_json,
        status: part.status,
        error_text: part.error_text,
      });
    case "tool_result":
      return stringifyAgentMessagePartData({
        tool_call_id: part.tool_call_id,
        output_json: part.output_json,
        error_text: part.error_text,
      });
    case "attachment_ref":
      return stringifyAgentMessagePartData({
        attachment_id: part.attachment_id,
      });
    case "approval_ref":
      return stringifyAgentMessagePartData({
        approval_id: part.approval_id,
        decision: part.decision,
        kind: part.kind,
        message: part.message,
        metadata: "metadata" in part ? part.metadata ?? null : null,
        status: part.status,
      });
    case "artifact_ref":
      return stringifyAgentMessagePartData({
        artifact_id: part.artifact_id,
        artifact_type: part.artifact_type,
        title: part.title,
        uri: part.uri,
      });
    default:
      return null;
  }
}

function toPartRecord(msg: AccumulatedMessage, entry: PartEntry, index: number): AgentMessagePartRecord {
  const p = entry.part;
  return {
    id: entry.id,
    message_id: msg.id,
    session_id: msg.session_id,
    part_index: index,
    part_type: p.type,
    text: "text" in p && typeof p.text === "string" ? p.text : null,
    data: partDataFromPart(p),
    created_at: msg.created_at,
  };
}

function toMessageWithParts(msg: AccumulatedMessage): AgentMessageWithParts {
  return {
    id: msg.id,
    session_id: msg.session_id,
    role: msg.role,
    text: renderText(msg),
    turn_id: msg.turn_id,
    parts: msg.parts.map((entry, i) => toPartRecord(msg, entry, i)),
    created_at: msg.created_at,
  };
}

/**
 * Persist a message to SQL first, then push the durable row into the live collection.
 */
async function flushMessage(msg: AccumulatedMessage): Promise<void> {
  const record = toMessageWithParts(msg);
  await persistToSql(record);
  upsertAgentMessageInCollection(tauriSqlDriver, msg.session_id, record);
}

async function persistToSql(record: AgentMessageWithParts): Promise<void> {
  await upsertAgentMessageWithParts(tauriSqlDriver, record);
}

function cacheSessionMetadata(session: AgentSessionRecord): void {
  observedSessionMetadata.set(session.id, {
    workspace_id: session.workspace_id,
    provider: session.provider,
    provider_session_id: session.provider_session_id,
  });
}

async function getObservedSessionMetadata(
  sessionId: string,
): Promise<Pick<AgentSessionRecord, "workspace_id" | "provider" | "provider_session_id"> | null> {
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

  if ("session_id" in event) {
    return event.session_id;
  }

  return null;
}

function eventTurnId(event: AgentEvent): string | null {
  switch (event.kind) {
    case "agent.turn.started":
    case "agent.turn.completed":
    case "agent.turn.failed":
      return event.turn_id;
    case "agent.message.created":
      return event.turn_id;
    default:
      return null;
  }
}

function inferMessageRole(messageId: string): AgentMessageRole {
  const segments = messageId.split(":");
  const candidate = segments[1];

  if (candidate === "user" || candidate === "assistant" || candidate === "system" || candidate === "tool") {
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
    workspace_id: metadata.workspace_id,
    provider: metadata.provider,
    provider_session_id: metadata.provider_session_id,
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
  message_id: string;
  part_id: string;
  part: AgentMessagePart;
  role: AgentMessageRole;
  session_id: string;
  turn_id?: string | null;
}): Promise<void> {
  const msg = getOrCreateMessage(
    input.message_id,
    input.session_id,
    input.role,
    input.turn_id ?? null,
  );
  appendPart(msg, input.part_id, input.part, false);
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
        const msg = getOrCreateMessage(event.message_id, event.session_id, event.role, event.turn_id);
        await flushMessage(msg);
      }

      if (event.kind === "agent.message.part.delta" || event.kind === "agent.message.part.completed") {
        const msg = getOrCreateMessage(
          event.message_id,
          event.session_id,
          inferMessageRole(event.message_id),
          inferMessageTurnId(event.message_id),
        );
        appendPart(msg, event.part_id, event.part, event.kind === "agent.message.part.delta");
        await flushMessage(msg);
      }

      if (event.kind === "agent.tool_call.updated") {
        const inputJson = JSON.stringify(event.tool_call.input_json);
        await flushSyntheticMessagePart({
          message_id: `tool:${event.tool_call.id}`,
          part_id: `tool:${event.tool_call.id}:call`,
          part: {
            type: "tool_call",
            tool_call_id: event.tool_call.id,
            tool_name: event.tool_call.tool_name,
            input_json: inputJson,
            output_json: event.tool_call.output_json
              ? JSON.stringify(event.tool_call.output_json)
              : undefined,
            status: event.tool_call.status,
            error_text: event.tool_call.error_text ?? undefined,
          },
          role: "tool",
          session_id: event.session_id,
        });

        if (event.tool_call.output_json || event.tool_call.error_text) {
          await flushSyntheticMessagePart({
            message_id: `tool:${event.tool_call.id}`,
            part_id: `tool:${event.tool_call.id}:result`,
            part: {
              type: "tool_result",
              tool_call_id: event.tool_call.id,
              output_json: event.tool_call.output_json
                ? JSON.stringify(event.tool_call.output_json)
                : undefined,
              error_text: event.tool_call.error_text ?? undefined,
            },
            role: "tool",
            session_id: event.session_id,
          });
        }
      }

      if (event.kind === "agent.approval.requested") {
        await flushSyntheticMessagePart({
          message_id: `approval:${event.approval.id}`,
          part_id: `approval:${event.approval.id}:ref`,
          part: {
            type: "approval_ref",
            approval_id: event.approval.id,
            kind: event.approval.kind,
            message: event.approval.message,
            metadata: event.approval.metadata ?? undefined,
            status: event.approval.status,
          },
          role: "system",
          session_id: event.session_id,
        });
      }

      if (event.kind === "agent.approval.resolved") {
        await flushSyntheticMessagePart({
          message_id: `approval:${event.resolution.approval_id}`,
          part_id: `approval:${event.resolution.approval_id}:ref`,
          part: {
            type: "approval_ref",
            approval_id: event.resolution.approval_id,
            decision: event.resolution.decision,
            status:
              event.resolution.decision === "reject"
                ? "rejected"
                : event.resolution.decision === "approve_session"
                  ? "approved_session"
                  : "approved_once",
          },
          role: "system",
          session_id: event.session_id,
        });
      }

      if (event.kind === "agent.artifact.published") {
        await flushSyntheticMessagePart({
          message_id: `artifact:${event.artifact.id}`,
          part_id: `artifact:${event.artifact.id}:ref`,
          part: {
            type: "artifact_ref",
            artifact_id: event.artifact.id,
            artifact_type: event.artifact.artifact_type,
            title: event.artifact.title,
            uri: event.artifact.uri,
          },
          role: "system",
          session_id: event.session_id,
        });
      }

      if (event.kind === "agent.session.created" || event.kind === "agent.session.updated") {
        refreshAgentSessionCollection(event.workspace_id);
        publishBrowserLifecycleEvent({
          kind: event.kind,
          workspace_id: event.workspace_id,
          session: event.session,
        });
      } else if (event.kind === "agent.turn.completed") {
        publishBrowserLifecycleEvent({
          kind: "agent.turn.completed",
          session_id: event.session_id,
          turn_id: event.turn_id,
          workspace_id: event.workspace_id,
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

function createLineReader(onLine: (line: string) => void) {
  let buffer = "";

  return (chunk: string) => {
    buffer += chunk;

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        onLine(line);
      }
    }
  };
}

function parseWorkerEvent(line: string): AgentWorkerEvent {
  return JSON.parse(line) as AgentWorkerEvent;
}

async function emitWorkerEvent(
  event: AgentWorkerEvent,
  session_id: string,
  workspace_id: string,
  emit: AgentEventObserver,
): Promise<void> {
  switch (event.kind) {
    // --- Streaming deltas ---
    case "agent.message.delta":
      await emit({
        kind: "agent.message.part.delta",
        message_id: `${event.turn_id}:assistant`,
        part: { type: "text", text: event.text },
        part_id: `${event.turn_id}:assistant:text:${event.block_index}`,
        session_id,
        workspace_id,
      });
      return;
    case "agent.thinking.delta":
      await emit({
        kind: "agent.message.part.delta",
        message_id: `${event.turn_id}:assistant`,
        part: { type: "thinking", text: event.text },
        part_id: `${event.turn_id}:assistant:thinking:${event.block_index}`,
        session_id,
        workspace_id,
      });
      return;
    case "agent.tool_use.start":
      await emit({
        kind: "agent.message.part.delta",
        message_id: `${event.turn_id}:assistant`,
        part: { type: "tool_call", tool_call_id: event.tool_use_id, tool_name: event.tool_name },
        part_id: `${event.turn_id}:assistant:tool:${event.tool_use_id}`,
        session_id,
        workspace_id,
      });
      return;
    case "agent.tool_use.input":
      await emit({
        kind: "agent.message.part.completed",
        message_id: `${event.turn_id}:assistant`,
        part: { type: "tool_call", tool_call_id: event.tool_use_id, tool_name: event.tool_name, input_json: event.input_json },
        part_id: `${event.turn_id}:assistant:tool:${event.tool_use_id}`,
        session_id,
        workspace_id,
      });
      return;
    case "agent.tool_progress":
      await emit({
        kind: "agent.message.part.delta",
        message_id: `${event.turn_id}:assistant`,
        part: { type: "status", text: `${event.tool_name} (${Math.round(event.elapsed_time_seconds)}s)` },
        part_id: `${event.turn_id}:assistant:tool:${event.tool_use_id}:progress`,
        session_id,
        workspace_id,
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
            message_id: `${event.turn_id}:assistant:item:${event.item.id}`,
            role: "assistant",
            session_id,
            turn_id: event.turn_id,
            workspace_id,
          });
          await emit({
            kind: "agent.message.part.completed",
            message_id: `${event.turn_id}:assistant:item:${event.item.id}`,
            part: { type: "text", text: event.item.text },
            part_id: `${event.turn_id}:assistant:item:${event.item.id}:text`,
            session_id,
            workspace_id,
          });
          return;
        case "reasoning":
          await emit({
            kind: "agent.message.created",
            message_id: `${event.turn_id}:assistant:reasoning:${event.item.id}`,
            role: "assistant",
            session_id,
            turn_id: event.turn_id,
            workspace_id,
          });
          await emit({
            kind: "agent.message.part.completed",
            message_id: `${event.turn_id}:assistant:reasoning:${event.item.id}`,
            part: { type: "thinking", text: event.item.text },
            part_id: `${event.turn_id}:assistant:reasoning:${event.item.id}:thinking`,
            session_id,
            workspace_id,
          });
          return;
        case "tool_call":
          await emit({
            kind: "agent.tool_call.updated",
            session_id,
            tool_call: {
              error_text: event.item.error_text,
              id: event.item.tool_call_id,
              input_json: parseWorkerJsonRecord(event.item.input_json),
              output_json: event.item.output_json ? parseWorkerJsonRecord(event.item.output_json) : null,
              session_id,
              status: mapWorkerItemStatus(event.item.status),
              tool_name: event.item.tool_name,
            },
            workspace_id,
          });
          return;
        case "command_execution":
          await emit({
            kind: "agent.tool_call.updated",
            session_id,
            tool_call: {
              error_text: event.item.status === "failed" ? event.item.output : null,
              id: event.item.id,
              input_json: { command: event.item.command },
              output_json: {
                command: event.item.command,
                exit_code: event.item.exit_code ?? null,
                output: event.item.output,
              },
              session_id,
              status: mapWorkerItemStatus(event.item.status),
              tool_name: "command_execution",
            },
            workspace_id,
          });
          return;
        case "file_change":
          await emit({
            kind: "agent.tool_call.updated",
            session_id,
            tool_call: {
              id: event.item.id,
              input_json: { changes: event.item.changes },
              output_json: { changes: event.item.changes },
              session_id,
              status: mapWorkerItemStatus(event.item.status),
              tool_name: "file_change",
            },
            workspace_id,
          });
          return;
        case "error":
          await emit({
            kind: "agent.tool_call.updated",
            session_id,
            tool_call: {
              error_text: event.item.message,
              id: event.item.id,
              input_json: { message: event.item.message },
              output_json: null,
              session_id,
              status: "failed",
              tool_name: "error",
            },
            workspace_id,
          });
          return;
      }
      return;

    // --- Status ---
    case "agent.approval.requested":
      await emit({
        kind: "agent.approval.requested",
        session_id,
        workspace_id,
        approval: {
          ...event.approval,
          session_id,
        },
      });
      return;
    case "agent.approval.resolved":
      await emit({
        kind: "agent.approval.resolved",
        session_id,
        workspace_id,
        resolution: {
          ...event.resolution,
          session_id,
        },
      });
      return;
    case "agent.status":
      await emit({
        kind: "agent.status.updated",
        session_id,
        workspace_id,
        status: event.status,
        detail: event.detail ?? null,
      });
      return;

    // --- Turn lifecycle ---
    case "agent.turn.completed":
      await emit({
        kind: "agent.turn.completed",
        session_id,
        turn_id: event.turn_id,
        workspace_id,
      });
      return;
    case "agent.turn.failed":
      await emit({
        kind: "agent.turn.failed",
        error: event.error,
        session_id,
        turn_id: event.turn_id,
        workspace_id,
      });
      return;

    // --- Auth ---
    case "worker.auth_status":
      await emit({
        kind: "agent.auth.updated",
        provider: "claude",
        authenticated: !event.is_authenticating && !event.error,
        mode: event.is_authenticating ? "authenticating" : event.error ? "error" : "ready",
        session_id,
        workspace_id,
      });
      return;
    case "worker.ready":
      return;
    default:
      return;
  }
}

async function launchClaudeWorker(options: {
  emit: AgentEventObserver;
  onReady: (provider_session_id: string) => Promise<void> | void;
  provider_session_id?: string | null;
  session_id: string;
  workspace_id: string;
  worktree_path: string;
}): Promise<AgentWorkerContract> {
  const settings = parseSettingsJson(await readAppSettings());
  const claudeSettings = settings.harnesses.claude;
  const args = [
    "agent",
    "worker",
    "claude",
    "--workspace-path",
    options.worktree_path,
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
  if (options.provider_session_id?.trim()) {
    args.push("--provider-session-id", options.provider_session_id.trim());
  }

  const command = Command.create("lifecycle", args, {
    cwd: options.worktree_path,
  });
  const liveStdout = createLineReader((line) => {
    try {
      const event = parseWorkerEvent(line);
      if (event.kind === "worker.ready") {
        void options.onReady(event.provider_session_id);
        return;
      }

      void emitWorkerEvent(event, options.session_id, options.workspace_id, options.emit);
    } catch (error) {
      console.error("Failed to parse agent worker stdout:", line, error);
    }
  });

  command.stdout.on("data", liveStdout);
  command.stderr.on("data", (line) => {
    console.error("[claude-worker]", line);
  });
  command.on("error", (error) => {
    console.error("[claude-worker] process error:", error);
  });
  command.on("close", ({ code, signal }) => {
    console.error(`[claude-worker] exited (code=${code ?? "null"} signal=${signal ?? "null"})`);
  });

  const child = await command.spawn();
  return new AgentWorker(child);
}

async function launchCodexWorker(options: {
  emit: AgentEventObserver;
  onReady: (provider_session_id: string) => Promise<void> | void;
  provider_session_id?: string | null;
  session_id: string;
  workspace_id: string;
  worktree_path: string;
}): Promise<AgentWorkerContract> {
  const settings = parseSettingsJson(await readAppSettings());
  const codexSettings = settings.harnesses.codex;
  const args = [
    "agent",
    "worker",
    "codex",
    "--workspace-path",
    options.worktree_path,
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
  if (options.provider_session_id?.trim()) {
    args.push("--provider-session-id", options.provider_session_id.trim());
  }

  const command = Command.create("lifecycle", args, {
    cwd: options.worktree_path,
  });
  const liveStdout = createLineReader((line) => {
    try {
      const event = parseWorkerEvent(line);
      if (event.kind === "worker.ready") {
        void options.onReady(event.provider_session_id);
        return;
      }

      void emitWorkerEvent(event, options.session_id, options.workspace_id, options.emit);
    } catch (error) {
      console.error("Failed to parse Codex worker stdout:", line, error);
    }
  });

  command.stdout.on("data", liveStdout);
  command.stderr.on("data", (line) => {
    console.error("[codex-worker]", line);
  });
  command.on("error", (error) => {
    console.error("[codex-worker] process error:", error);
  });
  command.on("close", ({ code, signal }) => {
    console.error(`[codex-worker] exited (code=${code ?? "null"} signal=${signal ?? "null"})`);
  });

  const child = await command.spawn();
  return new AgentWorker(child);
}

function normalizePrompt(turn: AgentTurnRequest["input"]): string {
  return turn
    .flatMap((part) => (part.type === "text" ? [part.text.trim()] : []))
    .filter((part) => part.length > 0)
    .join("\n\n");
}

class AgentWorker implements AgentWorkerContract {
  constructor(
    private readonly child: Child,
  ) {}

  async sendTurn(turn: AgentTurnRequest): Promise<void> {
    const prompt = normalizePrompt(turn.input);
    if (prompt.length === 0) {
      throw new Error("Agent prompt cannot be empty.");
    }

    const command: AgentWorkerCommand = {
      kind: "worker.send_turn",
      input: prompt,
      turn_id: turn.turn_id,
    };
    await this.child.write(`${JSON.stringify(command)}\n`);
  }

  async cancelTurn(request: AgentTurnCancelRequest): Promise<void> {
    const command: AgentWorkerCommand = {
      kind: "worker.cancel_turn",
      turn_id: request.turn_id ?? null,
    };
    await this.child.write(`${JSON.stringify(command)}\n`);
  }

  async resolveApproval(request: AgentApprovalResolution): Promise<void> {
    const command: AgentWorkerCommand = {
      approval_id: request.approval_id,
      decision: request.decision,
      kind: "worker.resolve_approval",
      response: request.response ?? null,
    };
    await this.child.write(`${JSON.stringify(command)}\n`);
  }
}

class ClaudeAgentWorkerLauncher implements AgentWorkerLauncher {
  private async updateSessionProviderBinding(
    session: AgentSessionRecord,
    provider_session_id: string,
    emit: AgentEventObserver,
  ): Promise<void> {
    const nextSession: AgentSessionRecord = {
      ...session,
      provider_session_id,
      runtime_name: "claude",
    };
    await upsertAgentSession(tauriSqlDriver, nextSession);
    cacheSessionMetadata(nextSession);
    await emit({
      kind: "agent.session.updated",
      session: nextSession,
      workspace_id: session.workspace_id,
    });
  }

  async startWorker(
    session: Parameters<AgentWorkerLauncher["startWorker"]>[0],
    context: AgentSessionContext,
    _runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ) {
    if (!context.worktree_path) {
      throw new Error(`Workspace ${session.workspace_id} has no worktree path for Claude.`);
    }

    const worker = await launchClaudeWorker({
      emit: events.emit,
      onReady: (provider_session_id) => this.updateSessionProviderBinding(session, provider_session_id, events.emit),
      session_id: session.id,
      workspace_id: session.workspace_id,
      worktree_path: context.worktree_path,
    });

    return {
      session: {
        ...session,
        runtime_name: "claude",
        provider_session_id: null,
      },
      worker,
    };
  }

  async connectWorker(
    session: Parameters<AgentWorkerLauncher["connectWorker"]>[0],
    context: AgentSessionContext,
    _runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<AgentWorkerContract> {
    if (!context.worktree_path) {
      throw new Error(`Workspace ${session.workspace_id} has no worktree path for Claude.`);
    }

    return launchClaudeWorker({
      emit: events.emit,
      onReady: async (provider_session_id) => {
        if (provider_session_id !== session.provider_session_id) {
          await this.updateSessionProviderBinding(session, provider_session_id, events.emit);
        }
      },
      provider_session_id: session.provider_session_id,
      session_id: session.id,
      workspace_id: session.workspace_id,
      worktree_path: context.worktree_path,
    });
  }
}

class CodexAgentWorkerLauncher implements AgentWorkerLauncher {
  private async updateSessionProviderBinding(
    session: AgentSessionRecord,
    provider_session_id: string,
    emit: AgentEventObserver,
  ): Promise<void> {
    const nextSession: AgentSessionRecord = {
      ...session,
      provider_session_id,
      runtime_name: "codex",
    };
    await upsertAgentSession(tauriSqlDriver, nextSession);
    cacheSessionMetadata(nextSession);
    await emit({
      kind: "agent.session.updated",
      session: nextSession,
      workspace_id: session.workspace_id,
    });
  }

  async startWorker(
    session: Parameters<AgentWorkerLauncher["startWorker"]>[0],
    context: AgentSessionContext,
    _runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ) {
    if (!context.worktree_path) {
      throw new Error(`Workspace ${session.workspace_id} has no worktree path for Codex.`);
    }

    const worker = await launchCodexWorker({
      emit: events.emit,
      onReady: (provider_session_id) => this.updateSessionProviderBinding(session, provider_session_id, events.emit),
      session_id: session.id,
      workspace_id: session.workspace_id,
      worktree_path: context.worktree_path,
    });

    return {
      session: {
        ...session,
        runtime_name: "codex",
        provider_session_id: null,
      },
      worker,
    };
  }

  async connectWorker(
    session: Parameters<AgentWorkerLauncher["connectWorker"]>[0],
    context: AgentSessionContext,
    _runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<AgentWorkerContract> {
    if (!context.worktree_path) {
      throw new Error(`Workspace ${session.workspace_id} has no worktree path for Codex.`);
    }

    return launchCodexWorker({
      emit: events.emit,
      onReady: async (provider_session_id) => {
        if (provider_session_id !== session.provider_session_id) {
          await this.updateSessionProviderBinding(session, provider_session_id, events.emit);
        }
      },
      provider_session_id: session.provider_session_id,
      session_id: session.id,
      workspace_id: session.workspace_id,
      worktree_path: context.worktree_path,
    });
  }
}

export function createAgentOrchestrator(hostRuntime: WorkspaceRuntime) {
  return createLifecycleAgentOrchestrator({
    workerLaunchers: {
      claude: new ClaudeAgentWorkerLauncher(),
      codex: new CodexAgentWorkerLauncher(),
    },
    resolveRuntime() {
      return hostRuntime;
    },
    store: {
      async saveSession(session) {
        await upsertAgentSession(tauriSqlDriver, session);
        return session;
      },
      async getSession(agent_session_id) {
        return (await selectAgentSessionById(tauriSqlDriver, agent_session_id)) ?? null;
      },
      listSessions(workspace_id) {
        return selectAgentSessionsByWorkspace(tauriSqlDriver, workspace_id);
      },
      async getWorkspace(workspace_id) {
        const workspaceRecord = await selectWorkspaceById(tauriSqlDriver, workspace_id);
        if (!workspaceRecord) {
          return null;
        }

        return {
          workspace_id,
          workspace_target: workspaceRecord.target,
          worktree_path: workspaceRecord.worktree_path,
        };
      },
    },
    observers: [observeAgentEvent],
  });
}
