import { Agent } from "@mariozechner/pi-agent-core";
import type {
  AgentEvent as PiAgentEvent,
  AgentMessage as PiAgentMessage,
  StreamFn,
} from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type {
  AssistantMessage,
  AssistantMessageEvent,
  ImageContent,
  Message,
  Model,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type {
  AgentEventRecord,
  AgentMessagePart,
  AgentMessagePartRecord,
  AgentMessageWithParts,
  AgentProviderId,
  AgentRecord,
  AgentStatus,
} from "@lifecycle/contracts";
import { parseAgentMessagePartData, stringifyAgentMessagePartData } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import {
  getAgentById,
  insertAgentEvent,
  listAgentMessagesWithParts,
  listAgentsByWorkspace,
  replaceAgentMessage,
  selectMaxAgentEventIndex,
  upsertAgent,
} from "@lifecycle/db/queries";
import { BridgeError } from "../../lib/errors";
import { resolveWorkspaceRecord } from "../workspace/resolve";

type AgentSocketUsage = {
  cacheReadTokens?: number | undefined;
  inputTokens: number;
  outputTokens: number;
};

type AgentSocketMessage = {
  type: string;
  kind: string;
  occurredAt: string;
  workspaceId?: string | undefined;
  agentId?: string | undefined;
  turnId?: string | null | undefined;
  messageId?: string | undefined;
  partId?: string | undefined;
  role?: string | undefined;
  status?: string | undefined;
  detail?: string | undefined;
  error?: string | undefined;
  eventType?: string | undefined;
  provider?: string | undefined;
  authenticated?: boolean | undefined;
  mode?: string | undefined;
  agent?: AgentRecord | undefined;
  usage?: AgentSocketUsage | undefined;
  costUsd?: number | undefined;
  part?: AgentMessagePart | Record<string, unknown> | undefined;
  toolCall?: Record<string, unknown> | undefined;
  approval?: Record<string, unknown> | undefined;
  resolution?: Record<string, unknown> | undefined;
  artifact?: Record<string, unknown> | undefined;
  payload?: unknown;
  projectedMessage?: AgentMessageWithParts | undefined;
};

export interface AgentBridgeServiceOptions {
  broadcast?: ((message: object) => Promise<void> | void) | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  streamFn?: StreamFn | undefined;
}

interface RuntimeEventCursor {
  value: number;
}

interface AgentRuntimeSession {
  agent: Agent;
  apiKey: string;
  broadcast: (message: object) => Promise<void>;
  currentTurnId: string | null;
  currentTurnSettled: boolean;
  db: SqlDriver;
  env: NodeJS.ProcessEnv;
  eventCursor: RuntimeEventCursor;
  model: Model<any>;
  record: AgentRecord;
}

const runtimeRegistry = new Map<string, AgentRuntimeSession>();

const EMPTY_USAGE: AssistantMessage["usage"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

const RECOVERABLE_DETACHED_STATUSES = new Set<AgentStatus>([
  "starting",
  "running",
  "waiting_approval",
]);

function agentTitleForProvider(provider: AgentProviderId): string {
  switch (provider) {
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
  }
}

function isoFromTimestamp(timestamp: number | undefined, fallback: string): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return fallback;
  }
  return new Date(timestamp).toISOString();
}

function textContentToString(content: string | Array<TextContent | ImageContent>): string {
  if (typeof content === "string") {
    return content;
  }

  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n\n");
}

function assistantText(content: Array<TextContent | ThinkingContent | ToolCall>): string {
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n\n");
}

function toolResultText(content: Array<TextContent | ImageContent>): string {
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n\n");
}

function messageText(message: PiAgentMessage): string {
  switch (message.role) {
    case "user":
      return textContentToString(message.content);
    case "assistant":
      return assistantText(message.content);
    case "toolResult":
      return toolResultText(message.content);
  }
}

function resolveMessageId(turnId: string | null, message: PiAgentMessage): string {
  if (turnId) {
    switch (message.role) {
      case "user":
        return `${turnId}:user`;
      case "assistant":
        return `${turnId}:assistant`;
      case "toolResult":
        return `${turnId}:tool:${message.toolCallId}`;
    }
  }

  const suffix = message.role === "toolResult" ? `tool:${message.toolCallId}` : message.role;
  const timestamp =
    typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
      ? message.timestamp
      : Date.now();
  return `${suffix}:${timestamp}`;
}

function normalizeAgentStatusFromAssistant(message: AssistantMessage): AgentStatus {
  if (message.stopReason === "aborted") {
    return "cancelled";
  }
  if (message.stopReason === "error") {
    return "failed";
  }
  return "idle";
}

function turnFailureText(message: AssistantMessage): string {
  if (message.stopReason === "aborted") {
    return message.errorMessage ?? "Agent turn was cancelled.";
  }
  return message.errorMessage ?? "Agent turn failed.";
}

function providerApiKey(provider: AgentProviderId, env: NodeJS.ProcessEnv): string | undefined {
  switch (provider) {
    case "claude":
      return env.ANTHROPIC_OAUTH_TOKEN ?? env.ANTHROPIC_API_KEY;
    case "codex":
      return env.OPENAI_API_KEY ?? env.OPENAI_API_TOKEN ?? env.CODEX_API_KEY;
  }
}

function providerModel(provider: AgentProviderId, env: NodeJS.ProcessEnv): Model<any> | undefined {
  switch (provider) {
    case "claude":
      return getModel(
        "anthropic",
        (env.LIFECYCLE_AGENT_CLAUDE_MODEL ?? "claude-sonnet-4-5") as never,
      );
    case "codex":
      return getModel(
        "openai-codex",
        (env.LIFECYCLE_AGENT_CODEX_MODEL ?? "gpt-5.3-codex") as never,
      );
  }
}

function requireProviderRuntime(
  provider: AgentProviderId,
  env: NodeJS.ProcessEnv,
): { apiKey: string; model: Model<any> } {
  const model = providerModel(provider, env);
  if (!model) {
    throw new BridgeError({
      code: "agent_model_not_found",
      message: `Lifecycle could not resolve a configured ${provider} model for the bridge runtime.`,
      status: 422,
    });
  }

  const apiKey = providerApiKey(provider, env);
  if (!apiKey) {
    throw new BridgeError({
      code: "agent_provider_not_configured",
      message: `Lifecycle could not find ${provider} credentials in the bridge environment.`,
      status: 422,
    });
  }

  return { apiKey, model };
}

async function resolveBroadcast(
  options: AgentBridgeServiceOptions | undefined,
): Promise<(message: object) => Promise<void>> {
  if (options?.broadcast) {
    return async (message) => {
      await options.broadcast?.(message);
    };
  }

  const [{ broadcastMessage }, { workspaceTopic }] = await Promise.all([
    import("../../lib/server"),
    import("../../lib/socket-topics"),
  ]);

  return async (message) => {
    const workspaceId =
      typeof (message as { workspaceId?: unknown }).workspaceId === "string"
        ? (message as { workspaceId: string }).workspaceId
        : typeof (message as { workspace_id?: unknown }).workspace_id === "string"
          ? (message as { workspace_id: string }).workspace_id
          : null;

    broadcastMessage(message, workspaceId ? workspaceTopic(workspaceId) : undefined);
  };
}

function partRecordToPayload(
  part: AgentMessagePartRecord,
): AgentMessagePart | Record<string, unknown> {
  switch (part.part_type) {
    case "text":
    case "thinking":
    case "status":
      return {
        type: part.part_type,
        text: part.text ?? "",
      };
    case "image": {
      const data = parseAgentMessagePartData("image", part.data);
      return data
        ? {
            type: "image",
            mediaType: data.media_type,
            base64Data: data.base64_data,
          }
        : { type: "image" };
    }
    case "tool_call": {
      const data = parseAgentMessagePartData("tool_call", part.data);
      return data
        ? {
            type: "tool_call",
            toolCallId: data.tool_call_id,
            toolName: data.tool_name,
            inputJson: data.input_json,
            outputJson: data.output_json,
            status: data.status,
            errorText: data.error_text,
          }
        : { type: "tool_call" };
    }
    case "tool_result": {
      const data = parseAgentMessagePartData("tool_result", part.data);
      return data
        ? {
            type: "tool_result",
            toolCallId: data.tool_call_id,
            outputJson: data.output_json,
            errorText: data.error_text,
          }
        : { type: "tool_result" };
    }
    case "attachment_ref": {
      const data = parseAgentMessagePartData("attachment_ref", part.data);
      return data
        ? {
            type: "attachment_ref",
            attachmentId: data.attachment_id,
          }
        : { type: "attachment_ref" };
    }
    case "approval_ref": {
      const data = parseAgentMessagePartData("approval_ref", part.data);
      return data
        ? {
            type: "approval_ref",
            approvalId: data.approval_id,
            decision: data.decision,
            kind: data.kind,
            message: data.message,
            metadata: data.metadata ?? undefined,
            status: data.status,
          }
        : { type: "approval_ref" };
    }
    case "artifact_ref": {
      const data = parseAgentMessagePartData("artifact_ref", part.data);
      return data
        ? {
            type: "artifact_ref",
            artifactId: data.artifact_id,
            artifactType: data.artifact_type,
            title: data.title,
            uri: data.uri,
          }
        : { type: "artifact_ref" };
    }
    default:
      return {
        type: part.part_type,
        text: part.text,
      };
  }
}

function messageParts(
  agentId: string,
  messageId: string,
  message: PiAgentMessage,
  createdAt: string,
): AgentMessagePartRecord[] {
  const pushTextPart = (
    parts: AgentMessagePartRecord[],
    partIndex: number,
    partType: "text" | "thinking" | "status",
    text: string,
  ) => {
    parts.push({
      id: `${messageId}:part:${partIndex}`,
      message_id: messageId,
      agent_id: agentId,
      part_index: partIndex,
      part_type: partType,
      text,
      data: null,
      created_at: createdAt,
    });
  };

  const parts: AgentMessagePartRecord[] = [];

  if (message.role === "user") {
    const content: Array<TextContent | ImageContent> =
      typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : message.content;
    for (const [index, part] of content.entries()) {
      if (part.type === "text") {
        pushTextPart(parts, index + 1, "text", part.text);
        continue;
      }

      parts.push({
        id: `${messageId}:part:${index + 1}`,
        message_id: messageId,
        agent_id: agentId,
        part_index: index + 1,
        part_type: "image",
        text: null,
        data: stringifyAgentMessagePartData({
          media_type: part.mimeType,
          base64_data: part.data,
        }),
        created_at: createdAt,
      });
    }
    return parts;
  }

  if (message.role === "assistant") {
    for (const [index, part] of message.content.entries()) {
      if (part.type === "text") {
        pushTextPart(parts, index + 1, "text", part.text);
        continue;
      }

      if (part.type === "thinking") {
        pushTextPart(parts, index + 1, "thinking", part.thinking);
        continue;
      }

      parts.push({
        id: `${messageId}:part:${index + 1}`,
        message_id: messageId,
        agent_id: agentId,
        part_index: index + 1,
        part_type: "tool_call",
        text: null,
        data: stringifyAgentMessagePartData({
          tool_call_id: part.id,
          tool_name: part.name,
          input_json: JSON.stringify(part.arguments),
          status: "queued",
        }),
        created_at: createdAt,
      });
    }
    return parts;
  }

  const outputText = toolResultText(message.content);
  parts.push({
    id: `${messageId}:part:1`,
    message_id: messageId,
    agent_id: agentId,
    part_index: 1,
    part_type: "tool_result",
    text: outputText.length > 0 ? outputText : null,
    data: stringifyAgentMessagePartData({
      tool_call_id: message.toolCallId,
      output_json: outputText.length > 0 ? outputText : undefined,
      error_text: message.isError ? outputText || "Tool call failed." : undefined,
    }),
    created_at: createdAt,
  });
  return parts;
}

function projectedMessage(
  runtime: AgentRuntimeSession,
  message: PiAgentMessage,
): AgentMessageWithParts {
  const createdAt = isoFromTimestamp(message.timestamp, new Date().toISOString());
  const turnId = runtime.currentTurnId;
  const id = resolveMessageId(turnId, message);
  const role = message.role === "toolResult" ? "tool" : message.role;
  return {
    id,
    agent_id: runtime.record.id,
    role,
    text: messageText(message),
    turn_id: turnId,
    created_at: createdAt,
    parts: messageParts(runtime.record.id, id, message, createdAt),
  };
}

function partIdForAssistantEvent(
  projected: AgentMessageWithParts,
  assistantEvent: AssistantMessageEvent,
): string | undefined {
  if (!("contentIndex" in assistantEvent)) {
    return undefined;
  }
  return projected.parts[assistantEvent.contentIndex]?.id;
}

function deltaPayload(event: AssistantMessageEvent): AgentMessagePart | null {
  switch (event.type) {
    case "text_delta":
      return { type: "text", text: event.delta };
    case "thinking_delta":
      return { type: "thinking", text: event.delta };
    default:
      return null;
  }
}

function usageFromAssistant(message: AssistantMessage): AgentSocketUsage | undefined {
  if (message.usage.input === 0 && message.usage.output === 0 && message.usage.cacheRead === 0) {
    return undefined;
  }

  return {
    inputTokens: message.usage.input,
    outputTokens: message.usage.output,
    ...(message.usage.cacheRead > 0 ? { cacheReadTokens: message.usage.cacheRead } : {}),
  };
}

function rehydrateAssistantMessage(
  message: AgentMessageWithParts,
  model: Model<any>,
): AssistantMessage {
  const content: Array<TextContent | ThinkingContent | ToolCall> = [];
  const sortedParts = message.parts
    .slice()
    .sort((left, right) => left.part_index - right.part_index);

  for (const part of sortedParts) {
    if (part.part_type === "text") {
      content.push({ type: "text", text: part.text ?? "" });
      continue;
    }

    if (part.part_type === "thinking") {
      content.push({ type: "thinking", thinking: part.text ?? "" });
      continue;
    }

    if (part.part_type === "tool_call") {
      const data = parseAgentMessagePartData("tool_call", part.data);
      if (!data) {
        continue;
      }

      let argumentsObject: Record<string, unknown> = {};
      if (data.input_json) {
        try {
          const parsed = JSON.parse(data.input_json) as Record<string, unknown>;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            argumentsObject = parsed;
          }
        } catch {
          argumentsObject = {};
        }
      }

      content.push({
        type: "toolCall",
        id: data.tool_call_id,
        name: data.tool_name,
        arguments: argumentsObject,
      });
    }
  }

  if (content.length === 0 && message.text.length > 0) {
    content.push({ type: "text", text: message.text });
  }

  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: EMPTY_USAGE,
    stopReason: "stop",
    timestamp: Date.parse(message.created_at) || Date.now(),
  };
}

function rehydrateUserMessage(message: AgentMessageWithParts): UserMessage {
  const blocks: Array<TextContent | ImageContent> = [];
  const sortedParts = message.parts
    .slice()
    .sort((left, right) => left.part_index - right.part_index);

  for (const part of sortedParts) {
    if (part.part_type === "text") {
      blocks.push({ type: "text", text: part.text ?? "" });
      continue;
    }

    if (part.part_type === "image") {
      const data = parseAgentMessagePartData("image", part.data);
      if (data) {
        blocks.push({
          type: "image",
          data: data.base64_data,
          mimeType: data.media_type,
        });
      }
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: "text", text: message.text });
  }

  return {
    role: "user",
    content: blocks,
    timestamp: Date.parse(message.created_at) || Date.now(),
  };
}

function rehydrateToolMessage(message: AgentMessageWithParts): ToolResultMessage | null {
  const toolPart = message.parts.find((part) => part.part_type === "tool_result");
  const data = toolPart ? parseAgentMessagePartData("tool_result", toolPart.data) : null;
  if (!data) {
    return null;
  }

  const text = toolPart?.text ?? message.text;
  return {
    role: "toolResult",
    toolCallId: data.tool_call_id,
    toolName: "tool",
    content: text.length > 0 ? [{ type: "text", text }] : [],
    details: undefined,
    isError: Boolean(data.error_text),
    timestamp: Date.parse(message.created_at) || Date.now(),
  };
}

function rehydrateMessages(messages: AgentMessageWithParts[], model: Model<any>): Message[] {
  const hydrated: Message[] = [];

  for (const message of messages) {
    switch (message.role) {
      case "user":
        hydrated.push(rehydrateUserMessage(message));
        break;
      case "assistant":
        hydrated.push(rehydrateAssistantMessage(message, model));
        break;
      case "tool": {
        const toolMessage = rehydrateToolMessage(message);
        if (toolMessage) {
          hydrated.push(toolMessage);
        }
        break;
      }
      default:
        break;
    }
  }

  return hydrated;
}

async function persistAndBroadcastSocketMessage(
  runtime: AgentRuntimeSession,
  message: AgentSocketMessage,
): Promise<void> {
  runtime.eventCursor.value += 1;
  const eventRecord: AgentEventRecord = {
    id: crypto.randomUUID(),
    agent_id: runtime.record.id,
    workspace_id: runtime.record.workspace_id,
    provider: runtime.record.provider,
    provider_id: runtime.record.provider_id,
    turn_id: message.turnId ?? null,
    event_index: runtime.eventCursor.value,
    event_kind: message.kind,
    payload: JSON.stringify(message),
    created_at: message.occurredAt,
  };
  await insertAgentEvent(runtime.db, eventRecord);
  await runtime.broadcast(message);
}

async function persistDetachedSocketMessage(
  db: SqlDriver,
  record: AgentRecord,
  cursor: RuntimeEventCursor,
  broadcast: (message: object) => Promise<void>,
  message: AgentSocketMessage,
): Promise<void> {
  cursor.value += 1;
  const eventRecord: AgentEventRecord = {
    id: crypto.randomUUID(),
    agent_id: record.id,
    workspace_id: record.workspace_id,
    provider: record.provider,
    provider_id: record.provider_id,
    turn_id: message.turnId ?? null,
    event_index: cursor.value,
    event_kind: message.kind,
    payload: JSON.stringify(message),
    created_at: message.occurredAt,
  };
  await insertAgentEvent(db, eventRecord);
  await broadcast(message);
}

async function updateRuntimeRecord(
  runtime: AgentRuntimeSession,
  updates: Partial<AgentRecord>,
): Promise<AgentRecord> {
  const next: AgentRecord = {
    ...runtime.record,
    ...updates,
  };
  await upsertAgent(runtime.db, next);
  runtime.record = next;
  return next;
}

async function emitAgentUpdated(
  runtime: AgentRuntimeSession,
  agent: AgentRecord = runtime.record,
): Promise<void> {
  await persistAndBroadcastSocketMessage(runtime, {
    type: "agent.updated",
    kind: "agent.updated",
    occurredAt: agent.updated_at,
    workspaceId: agent.workspace_id,
    agentId: agent.id,
    agent,
  });
}

async function completeMessage(
  runtime: AgentRuntimeSession,
  message: PiAgentMessage,
): Promise<void> {
  const projected = projectedMessage(runtime, message);
  await replaceAgentMessage(runtime.db, projected);

  for (const part of projected.parts) {
    await persistAndBroadcastSocketMessage(runtime, {
      type: "agent.message.part.completed",
      kind: "agent.message.part.completed",
      occurredAt: part.created_at,
      workspaceId: runtime.record.workspace_id,
      agentId: runtime.record.id,
      turnId: projected.turn_id,
      messageId: projected.id,
      partId: part.id,
      part: partRecordToPayload(part),
      projectedMessage: projected,
    });
  }
}

async function emitAssistantDelta(
  runtime: AgentRuntimeSession,
  message: PiAgentMessage,
  assistantEvent: AssistantMessageEvent,
): Promise<void> {
  if (message.role !== "assistant") {
    return;
  }

  const part = deltaPayload(assistantEvent);
  if (!part) {
    return;
  }

  const projected = projectedMessage(runtime, message);
  const partId = partIdForAssistantEvent(projected, assistantEvent);
  if (!partId) {
    return;
  }

  await persistAndBroadcastSocketMessage(runtime, {
    type: "agent.message.part.delta",
    kind: "agent.message.part.delta",
    occurredAt: new Date().toISOString(),
    workspaceId: runtime.record.workspace_id,
    agentId: runtime.record.id,
    turnId: projected.turn_id,
    messageId: projected.id,
    partId,
    part,
    projectedMessage: projected,
  });
}

async function settleTurn(runtime: AgentRuntimeSession, message: AssistantMessage): Promise<void> {
  const occurredAt = isoFromTimestamp(message.timestamp, new Date().toISOString());
  const turnId = runtime.currentTurnId;
  const nextStatus = normalizeAgentStatusFromAssistant(message);
  const updated = await updateRuntimeRecord(runtime, {
    last_message_at: occurredAt,
    status: nextStatus,
    updated_at: occurredAt,
  });

  if (turnId) {
    if (nextStatus === "idle") {
      await persistAndBroadcastSocketMessage(runtime, {
        type: "agent.turn.completed",
        kind: "agent.turn.completed",
        occurredAt,
        workspaceId: updated.workspace_id,
        agentId: updated.id,
        turnId,
        ...(usageFromAssistant(message) ? { usage: usageFromAssistant(message) } : {}),
        ...(message.usage.cost.total > 0 ? { costUsd: message.usage.cost.total } : {}),
      });
    } else {
      await persistAndBroadcastSocketMessage(runtime, {
        type: "agent.turn.failed",
        kind: "agent.turn.failed",
        occurredAt,
        workspaceId: updated.workspace_id,
        agentId: updated.id,
        turnId,
        error: turnFailureText(message),
      });
    }
  }

  runtime.currentTurnSettled = true;
  runtime.currentTurnId = null;
  await emitAgentUpdated(runtime, updated);
}

async function settleDetachedRuntimeIfNeeded(runtime: AgentRuntimeSession): Promise<void> {
  if (runtime.currentTurnSettled || !runtime.currentTurnId) {
    return;
  }

  const lastMessage = runtime.agent.state.messages.at(-1);
  if (lastMessage?.role === "assistant") {
    await completeMessage(runtime, lastMessage);
    await settleTurn(runtime, lastMessage);
    return;
  }

  const occurredAt = new Date().toISOString();
  const updated = await updateRuntimeRecord(runtime, {
    status: "failed",
    updated_at: occurredAt,
  });

  await persistAndBroadcastSocketMessage(runtime, {
    type: "agent.turn.failed",
    kind: "agent.turn.failed",
    occurredAt,
    workspaceId: updated.workspace_id,
    agentId: updated.id,
    turnId: runtime.currentTurnId,
    error: "Agent turn ended without a projected assistant message.",
  });
  runtime.currentTurnSettled = true;
  runtime.currentTurnId = null;
  await emitAgentUpdated(runtime, updated);
}

async function handleRuntimeEvent(
  runtime: AgentRuntimeSession,
  event: PiAgentEvent,
): Promise<void> {
  switch (event.type) {
    case "turn_start":
      if (!runtime.currentTurnId) {
        return;
      }
      runtime.currentTurnSettled = false;
      await persistAndBroadcastSocketMessage(runtime, {
        type: "agent.turn.started",
        kind: "agent.turn.started",
        occurredAt: new Date().toISOString(),
        workspaceId: runtime.record.workspace_id,
        agentId: runtime.record.id,
        turnId: runtime.currentTurnId,
      });
      return;
    case "message_update":
      await emitAssistantDelta(runtime, event.message, event.assistantMessageEvent);
      return;
    case "message_end":
      await completeMessage(runtime, event.message);
      return;
    case "turn_end":
      if (event.message.role === "assistant") {
        await settleTurn(runtime, event.message);
      }
      return;
    case "agent_end":
      await settleDetachedRuntimeIfNeeded(runtime);
      return;
    default:
      return;
  }
}

async function createRuntime(
  db: SqlDriver,
  record: AgentRecord,
  options: AgentBridgeServiceOptions | undefined,
): Promise<AgentRuntimeSession> {
  const existing = runtimeRegistry.get(record.id);
  if (existing) {
    return existing;
  }

  const env = options?.env ?? process.env;
  const broadcast = await resolveBroadcast(options);
  const { apiKey, model } = requireProviderRuntime(record.provider, env);
  const [messages, eventIndex] = await Promise.all([
    listAgentMessagesWithParts(db, record.id),
    selectMaxAgentEventIndex(db, record.id),
  ]);

  const runtime: AgentRuntimeSession = {
    agent: new Agent({
      initialState: {
        model,
        messages: rehydrateMessages(messages, model),
      },
      getApiKey: async () => apiKey,
      sessionId: record.id,
      ...(options?.streamFn ? { streamFn: options.streamFn } : {}),
    }),
    apiKey,
    broadcast,
    currentTurnId: null,
    currentTurnSettled: true,
    db,
    env,
    eventCursor: { value: eventIndex },
    model,
    record,
  };

  runtime.agent.subscribe(async (event) => {
    await handleRuntimeEvent(runtime, event);
  });

  runtimeRegistry.set(record.id, runtime);
  return runtime;
}

async function requireAgentRecord(db: SqlDriver, agentId: string): Promise<AgentRecord> {
  const record = await getAgentById(db, agentId);
  if (!record) {
    throw new BridgeError({
      code: "agent_not_found",
      message: `Could not resolve agent "${agentId}".`,
      status: 404,
    });
  }

  return record;
}

async function recoverDetachedAgent(
  db: SqlDriver,
  record: AgentRecord,
  options: AgentBridgeServiceOptions | undefined,
): Promise<AgentRecord> {
  if (runtimeRegistry.has(record.id) || !RECOVERABLE_DETACHED_STATUSES.has(record.status)) {
    return record;
  }

  const occurredAt = new Date().toISOString();
  const updated: AgentRecord = {
    ...record,
    status: "idle",
    updated_at: occurredAt,
  };
  await upsertAgent(db, updated);

  const cursor = { value: await selectMaxAgentEventIndex(db, record.id) };
  const broadcast = await resolveBroadcast(options);
  await persistDetachedSocketMessage(db, updated, cursor, broadcast, {
    type: "agent.updated",
    kind: "agent.updated",
    occurredAt,
    workspaceId: updated.workspace_id,
    agentId: updated.id,
    agent: updated,
  });
  return updated;
}

export async function listWorkspaceAgents(
  db: SqlDriver,
  workspaceId: string,
): Promise<AgentRecord[]> {
  await resolveWorkspaceRecord(db, workspaceId);
  return listAgentsByWorkspace(db, workspaceId);
}

export async function createWorkspaceAgent(
  db: SqlDriver,
  workspaceId: string,
  provider: AgentProviderId,
  options?: AgentBridgeServiceOptions,
): Promise<AgentRecord> {
  await resolveWorkspaceRecord(db, workspaceId);
  const env = options?.env ?? process.env;
  requireProviderRuntime(provider, env);

  const now = new Date().toISOString();
  const record: AgentRecord = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    provider,
    provider_id: null,
    title: agentTitleForProvider(provider),
    status: "idle",
    last_message_at: null,
    created_at: now,
    updated_at: now,
  };

  await upsertAgent(db, record);
  const runtime = await createRuntime(db, record, options);
  await emitAgentUpdated(runtime, record);
  return record;
}

export async function getAgentSnapshot(
  db: SqlDriver,
  agentId: string,
  options?: AgentBridgeServiceOptions,
): Promise<{ agent: AgentRecord; messages: AgentMessageWithParts[] }> {
  const record = await recoverDetachedAgent(db, await requireAgentRecord(db, agentId), options);

  return {
    agent: record,
    messages: await listAgentMessagesWithParts(db, agentId),
  };
}

export async function sendAgentTurn(
  db: SqlDriver,
  agentId: string,
  turnId: string,
  text: string,
  options?: AgentBridgeServiceOptions,
): Promise<AgentRecord> {
  const record = await recoverDetachedAgent(db, await requireAgentRecord(db, agentId), options);
  const runtime = await createRuntime(db, record, options);

  if (runtime.currentTurnId || runtime.agent.state.isStreaming) {
    throw new BridgeError({
      code: "agent_turn_in_progress",
      message: `Agent "${agentId}" is already processing a turn.`,
      status: 409,
    });
  }

  const occurredAt = new Date().toISOString();
  const updated = await updateRuntimeRecord(runtime, {
    last_message_at: occurredAt,
    status: "running",
    updated_at: occurredAt,
  });

  runtime.currentTurnId = turnId;
  runtime.currentTurnSettled = false;
  await emitAgentUpdated(runtime, updated);

  void runtime.agent.prompt(text).catch(async (error) => {
    const failureAt = new Date().toISOString();
    const failed = await updateRuntimeRecord(runtime, {
      status: "failed",
      updated_at: failureAt,
    });
    await persistAndBroadcastSocketMessage(runtime, {
      type: "agent.turn.failed",
      kind: "agent.turn.failed",
      occurredAt: failureAt,
      workspaceId: failed.workspace_id,
      agentId: failed.id,
      turnId: runtime.currentTurnId,
      error: error instanceof Error ? error.message : "Agent turn failed.",
    });
    runtime.currentTurnSettled = true;
    runtime.currentTurnId = null;
    await emitAgentUpdated(runtime, failed);
  });

  return updated;
}

export async function cancelAgentTurn(
  db: SqlDriver,
  agentId: string,
  turnId?: string,
  options?: AgentBridgeServiceOptions,
): Promise<AgentRecord> {
  const record = await recoverDetachedAgent(db, await requireAgentRecord(db, agentId), options);
  const runtime = runtimeRegistry.get(agentId);

  if (!runtime || !runtime.currentTurnId || !runtime.agent.state.isStreaming) {
    return record;
  }

  if (turnId && runtime.currentTurnId !== turnId) {
    throw new BridgeError({
      code: "agent_turn_not_found",
      message: `Agent "${agentId}" is not processing turn "${turnId}".`,
      status: 409,
    });
  }

  runtime.agent.abort();
  return runtime.record;
}

export async function resolveAgentApproval(): Promise<never> {
  throw new BridgeError({
    code: "agent_approvals_not_supported",
    message: "Lifecycle bridge approvals are not enabled for this agent runtime yet.",
    status: 409,
  });
}

export async function waitForAgentIdle(agentId: string): Promise<void> {
  const runtime = runtimeRegistry.get(agentId);
  if (!runtime) {
    return;
  }
  await runtime.agent.waitForIdle();
}

export function resetAgentRuntimeRegistry(): void {
  for (const runtime of runtimeRegistry.values()) {
    runtime.agent.abort();
  }
  runtimeRegistry.clear();
}
