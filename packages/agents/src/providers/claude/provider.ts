import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import * as ClaudeAgentSdk from "@anthropic-ai/claude-agent-sdk";
import {
  unstable_v2_createSession,
  unstable_v2_prompt,
  unstable_v2_resumeSession,
  type CanUseTool,
  type ElicitationRequest,
  type ElicitationResult,
  type OnElicitation,
  type PermissionResult,
  type SDKMessage,
  type SDKResultMessage,
  type SDKSession,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentProviderRequest,
  AgentProviderRequestResolution,
  AgentProviderSignal,
} from "@lifecycle/contracts";
import type {
  AgentApprovalRequestPayload,
  AgentCommand,
  AgentStreamEvent,
  AgentInputPart,
} from "../../stream-protocol";
import { LIFECYCLE_SYSTEM_PROMPT } from "../../system-prompt";
import { buildSessionEnv, type ClaudeLoginMethod } from "./env";

const createQuery = "query" in ClaudeAgentSdk ? ClaudeAgentSdk.query : null;

// ---------------------------------------------------------------------------
// Lightweight title generation — spins up a minimal SDK session so it shares
// the same auth (OAuth / API key) as the main agent.
// ---------------------------------------------------------------------------

function truncateTitle(text: string, maxLength = 40): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  const truncated = clean.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 10 ? truncated.slice(0, lastSpace) : truncated;
}

function extractTextFromInput(parts: AgentInputPart[]): string {
  return parts
    .filter((p): p is Extract<AgentInputPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}

async function generateSessionTitle(
  userText: string,
  loginMethod: ClaudeLoginMethod,
): Promise<string | null> {
  try {
    const options = {
      model: "claude-haiku-4-5-20251001",
      permissionMode: "plan" as const,
      env: buildSessionEnv(loginMethod),
      systemPrompt:
        "You are a title generator. You ONLY output a short 3-5 word title. No sentences, no answers, no quotes, no punctuation. Just a title.",
    };
    const prompt = `Generate a 3-5 word title summarizing this user message. Output ONLY the title, nothing else.\n\n---\n${userText.slice(0, 500)}\n---`;
    const result = await unstable_v2_prompt(prompt, options);
    if (result.subtype === "success" && typeof result.result === "string") {
      const title = result.result.trim();
      return title || truncateTitle(userText);
    }
    return truncateTitle(userText);
  } catch {
    return truncateTitle(userText);
  }
}

export type ClaudeProviderPermissionMode =
  | "acceptEdits"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan";

export { type ClaudeLoginMethod } from "./env";

export interface ClaudeProviderInput {
  dangerousSkipPermissions: boolean;
  effort?: "low" | "medium" | "high" | "max";
  loginMethod: ClaudeLoginMethod;
  mcpServers?: Record<
    string,
    { type?: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  >;
  model: string;
  permissionMode: ClaudeProviderPermissionMode;
  providerId?: string;
  workspacePath: string;
}

interface PendingClaudeApproval {
  approval: AgentApprovalRequestPayload;
  resolve: (resolution: {
    decision: "approve_once" | "approve_session" | "reject";
    response?: Record<string, unknown> | null;
  }) => void;
  turnId: string;
}

interface ClaudeTurnStreamState {
  activeToolBlocks: Map<string, { toolName: string; toolUseId: string; inputChunks: string[] }>;
  assistantRound: number;
  emittedAssistantBlockIds: Set<string>;
  emittedToolUseIds: Set<string>;
}

function emitProviderEvent(event: AgentStreamEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function emitRawProviderEvent(eventType: string, payload: unknown, turnId?: string | null): void {
  emitProviderEvent({
    kind: "agent.raw_event",
    eventType,
    payload,
    ...(turnId === undefined ? {} : { turnId }),
  });
}

function emitProviderSignal(input: {
  channel: AgentProviderSignal["channel"];
  name: string;
  metadata?: Record<string, unknown> | null;
  itemId?: string | null;
  requestId?: string | null;
  turnId?: string | null;
}): void {
  emitProviderEvent({
    kind: "agent.provider.signal",
    signal: {
      channel: input.channel,
      name: input.name,
      ...(input.itemId === undefined ? {} : { itemId: input.itemId }),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
  });
}

function emitProviderRequest(input: {
  request: AgentProviderRequest;
  turnId?: string | null;
}): void {
  emitProviderEvent({
    kind: "agent.provider.requested",
    request: input.request,
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
  });
}

function emitProviderRequestResolution(input: {
  resolution: AgentProviderRequestResolution;
  turnId?: string | null;
}): void {
  emitProviderEvent({
    kind: "agent.provider.request.resolved",
    resolution: input.resolution,
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractFailure(message: SDKResultMessage): string | null {
  if (message.subtype === "success") {
    return null;
  }
  if (message.errors.length > 0) {
    return message.errors.join("\n").trim();
  }
  return `Claude turn failed: ${message.subtype}`;
}

function extractUsage(
  message: SDKResultMessage,
): { inputTokens: number; outputTokens: number; cacheReadTokens?: number | undefined } | undefined {
  if (!("usage" in message) || !message.usage) {
    return undefined;
  }
  const usage = message.usage as Record<string, number>;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? undefined,
  };
}

function extractCost(message: SDKResultMessage): number | undefined {
  if ("total_cost_usd" in message && typeof message.total_cost_usd === "number") {
    return message.total_cost_usd;
  }
  return undefined;
}

function normalizeCommand(raw: string): AgentCommand {
  return JSON.parse(raw) as AgentCommand;
}

function normalizeApprovalResponse(
  response: Record<string, unknown> | null | undefined,
  fallbackInput: Record<string, unknown>,
): Record<string, unknown> {
  return response && isRecord(response) ? response : fallbackInput;
}

function serializeToolInput(input: Record<string, unknown>): string | null {
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

function mapRequestOutcomeToApprovalDecision(
  outcome: AgentProviderRequestResolution["outcome"],
): "approve_once" | "approve_session" | "reject" {
  switch (outcome) {
    case "approved":
    case "submitted":
    case "completed":
      return "approve_once";
    case "cancelled":
    case "failed":
    case "rejected":
    default:
      return "reject";
  }
}

function getClaudeAssistantBlockKey(turnId: string, blockId: string): string {
  return `${turnId}:${blockId}`;
}

function getClaudeToolBlockKey(round: number, blockIndex: number): string {
  return `${round}:${blockIndex}`;
}

function createClaudeTurnStreamState(): ClaudeTurnStreamState {
  return {
    activeToolBlocks: new Map(),
    assistantRound: 0,
    emittedAssistantBlockIds: new Set(),
    emittedToolUseIds: new Set(),
  };
}

function buildClaudeTextDeltaEvent(input: {
  blockId: string;
  emittedBlockIds: Set<string>;
  text: string;
  turnId: string;
}): AgentStreamEvent | null {
  const blockKey = getClaudeAssistantBlockKey(input.turnId, input.blockId);
  if (input.emittedBlockIds.has(blockKey)) {
    return null;
  }
  input.emittedBlockIds.add(blockKey);
  return {
    kind: "agent.message.delta",
    text: input.text,
    turnId: input.turnId,
    blockId: input.blockId,
  };
}

function buildClaudeThinkingDeltaEvent(input: {
  blockId: string;
  emittedBlockIds: Set<string>;
  text: string;
  turnId: string;
}): AgentStreamEvent | null {
  const blockKey = getClaudeAssistantBlockKey(input.turnId, input.blockId);
  if (input.emittedBlockIds.has(blockKey)) {
    return null;
  }
  input.emittedBlockIds.add(blockKey);
  return {
    kind: "agent.thinking.delta",
    text: input.text,
    turnId: input.turnId,
    blockId: input.blockId,
  };
}

export function buildClaudeToolUseEvents(input: {
  toolInput: Record<string, unknown>;
  toolName: string;
  toolUseId: string;
  turnId: string;
}): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [
    {
      kind: "agent.tool_use.start",
      toolName: input.toolName,
      toolUseId: input.toolUseId,
      turnId: input.turnId,
    },
  ];
  const inputJson = serializeToolInput(input.toolInput);
  if (inputJson) {
    events.push({
      kind: "agent.tool_use.input",
      inputJson,
      toolName: input.toolName,
      toolUseId: input.toolUseId,
      turnId: input.turnId,
    });
  }
  return events;
}

export function buildClaudeAssistantContentEvents(input: {
  content: Record<string, unknown>[];
  emittedBlockIds: Set<string>;
  emittedToolUseIds: Set<string>;
  round?: number;
  turnId: string;
}): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  const roundPrefix = input.round != null ? `${input.round}:` : "";

  for (const [index, block] of input.content.entries()) {
    const blockIdBase = `${index}`;

    if (block.type === "text" && typeof block.text === "string") {
      const event = buildClaudeTextDeltaEvent({
        blockId: `text:${roundPrefix}${blockIdBase}`,
        emittedBlockIds: input.emittedBlockIds,
        text: block.text,
        turnId: input.turnId,
      });
      if (event) {
        events.push(event);
      }
      continue;
    }

    if (block.type === "thinking" && typeof block.thinking === "string") {
      const event = buildClaudeThinkingDeltaEvent({
        blockId: `thinking:${roundPrefix}${blockIdBase}`,
        emittedBlockIds: input.emittedBlockIds,
        text: block.thinking,
        turnId: input.turnId,
      });
      if (event) {
        events.push(event);
      }
      continue;
    }

    if (block.type === "tool_use" && typeof block.name === "string") {
      const toolUseId = (block.id as string) ?? "";
      if (input.emittedToolUseIds.has(toolUseId)) {
        continue;
      }
      input.emittedToolUseIds.add(toolUseId);
      events.push(
        ...buildClaudeToolUseEvents({
          toolInput: isRecord(block.input) ? block.input : {},
          toolName: block.name,
          toolUseId,
          turnId: input.turnId,
        }),
      );
    }
  }

  return events;
}

function mapClaudeToolToApprovalKind(
  toolName: string,
  input: Record<string, unknown>,
): AgentApprovalRequestPayload["kind"] {
  if (toolName === "AskUserQuestion") {
    return "question";
  }

  if (toolName === "Bash") {
    return "shell";
  }

  if (toolName === "WebFetch") {
    return "network";
  }

  if (toolName === "Agent") {
    return "handoff";
  }

  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
    return "file_write";
  }

  if (
    toolName === "Delete" ||
    toolName === "DeleteFile" ||
    toolName === "Remove" ||
    toolName === "Rm" ||
    /delete|remove|rm/i.test(toolName)
  ) {
    return "file_delete";
  }

  void input;
  return "tool";
}

function buildClaudeToolApprovalMessage(
  toolName: string,
  input: Record<string, unknown>,
  options: {
    displayName?: string;
    title?: string;
  },
): string {
  if (options.title?.trim()) {
    return options.title.trim();
  }

  if (toolName === "AskUserQuestion") {
    return "Claude needs more input before it can continue.";
  }

  if (toolName === "Bash" && typeof input.command === "string") {
    return `Claude wants to run: ${input.command}`;
  }

  if (typeof input.file_path === "string") {
    const verb =
      toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit"
        ? "change"
        : toolName === "Read"
          ? "read"
          : "use";
    return `Claude wants to ${verb} ${input.file_path}`;
  }

  if (options.displayName?.trim()) {
    return `Claude wants to ${options.displayName.trim().toLowerCase()}.`;
  }

  return `Claude wants to use ${toolName}.`;
}

function createPendingApprovalPromise(
  approval: AgentApprovalRequestPayload,
  pendingApprovals: Map<string, PendingClaudeApproval>,
  turnId: string,
  signal?: AbortSignal,
): Promise<{
  decision: "approve_once" | "approve_session" | "reject";
  response?: Record<string, unknown> | null;
}> {
  emitProviderEvent({
    kind: "agent.approval.requested",
    approval,
    turnId,
  });

  return new Promise((resolve) => {
    const onAbort = () => {
      pendingApprovals.delete(approval.id);
      resolve({
        decision: "reject",
        response: { message: "Claude approval request was cancelled." },
      });
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    pendingApprovals.set(approval.id, {
      approval,
      resolve: (resolution) => {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        resolve(resolution);
      },
      turnId,
    });
  });
}

function handleStreamMessage(
  message: SDKMessage,
  turnId: string,
  streamState: ClaudeTurnStreamState,
  signal?: AbortSignal,
): "result" | "continue" {
  emitRawProviderEvent(
    message.type === "stream_event"
      ? `claude.stream_event.${String((message.event as Record<string, unknown>)?.type ?? "unknown")}`
      : `claude.message.${message.type}`,
    message,
    turnId,
  );

  // Skip emitting streaming events after abort — the turn is already cancelled.
  // Still process "result" messages so the stream loop can terminate cleanly.
  if (signal?.aborted && message.type !== "result") {
    return "continue";
  }

  if (message.type === "auth_status") {
    emitProviderEvent({
      kind: "agent.auth_status",
      isAuthenticating: message.isAuthenticating,
      output: message.output,
      ...(message.error ? { error: message.error } : {}),
    });
    emitProviderSignal({
      channel: "auth",
      name: "status",
      metadata: {
        error: message.error ?? null,
        isAuthenticating: message.isAuthenticating,
        output: message.output,
      },
      turnId,
    });
    return "continue";
  }

  if (message.type === "stream_event") {
    const event = message.event as Record<string, unknown>;

    if (event.type === "content_block_start") {
      const blockIndex = (event.index as number) ?? 0;
      const toolBlockKey = getClaudeToolBlockKey(streamState.assistantRound, blockIndex);
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use" && typeof block.name === "string") {
        const toolUseId = (block.id as string) ?? "";
        streamState.activeToolBlocks.set(toolBlockKey, {
          toolName: block.name,
          toolUseId,
          inputChunks: [],
        });
        emitProviderEvent({
          kind: "agent.tool_use.start",
          toolName: block.name,
          toolUseId,
          turnId,
        });
      }
    } else if (event.type === "content_block_delta") {
      const blockIndex = (event.index as number) ?? 0;
      const toolBlockKey = getClaudeToolBlockKey(streamState.assistantRound, blockIndex);
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        // Mark this block as emitted so the assistant-message catchup path
        // (`buildClaudeAssistantContentEvents`) won't re-emit the full text.
        const blockId = `text:${streamState.assistantRound}:${blockIndex}`;
        streamState.emittedAssistantBlockIds.add(getClaudeAssistantBlockKey(turnId, blockId));
        emitProviderEvent({
          kind: "agent.message.delta",
          text: delta.text,
          turnId,
          blockId,
        });
      } else if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
        const blockId = `thinking:${streamState.assistantRound}:${blockIndex}`;
        streamState.emittedAssistantBlockIds.add(getClaudeAssistantBlockKey(turnId, blockId));
        emitProviderEvent({
          kind: "agent.thinking.delta",
          text: delta.thinking,
          turnId,
          blockId,
        });
      } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const toolBlock = streamState.activeToolBlocks.get(toolBlockKey);
        if (toolBlock) {
          toolBlock.inputChunks.push(delta.partial_json);
        }
      }
    } else if (event.type === "content_block_stop") {
      const blockIndex = (event.index as number) ?? 0;
      const toolBlockKey = getClaudeToolBlockKey(streamState.assistantRound, blockIndex);
      const toolBlock = streamState.activeToolBlocks.get(toolBlockKey);
      if (toolBlock) {
        const inputJson = toolBlock.inputChunks.join("");
        if (inputJson.length > 0) {
          emitProviderEvent({
            kind: "agent.tool_use.input",
            toolName: toolBlock.toolName,
            toolUseId: toolBlock.toolUseId,
            inputJson,
            turnId,
          });
        }
        streamState.emittedToolUseIds.add(toolBlock.toolUseId);
        streamState.activeToolBlocks.delete(toolBlockKey);
      }
    }

    return "continue";
  }

  if (message.type === "tool_progress") {
    emitProviderEvent({
      kind: "agent.tool_progress",
      toolName: message.tool_name,
      toolUseId: message.tool_use_id,
      elapsedTimeSeconds: message.elapsed_time_seconds,
      turnId,
    });
    return "continue";
  }

  if (message.type === "system" && "subtype" in message) {
    const systemMessage = message as Record<string, unknown>;

    if (systemMessage.subtype === "init") {
      emitProviderSignal({
        channel: "system",
        name: "init",
        metadata: systemMessage,
        turnId,
      });
    }

    if (systemMessage.subtype === "status") {
      const status = systemMessage.status as string | null;
      if (status) {
        emitProviderEvent({
          kind: "agent.status",
          status,
          turnId,
        });
      }
      emitProviderSignal({
        channel: "system",
        name: "status",
        metadata: systemMessage,
        turnId,
      });
    }

    if (
      systemMessage.subtype === "task_started" ||
      systemMessage.subtype === "task_progress" ||
      systemMessage.subtype === "task_notification"
    ) {
      const text = (systemMessage.summary as string) ?? (systemMessage.description as string) ?? "";
      if (text) {
        emitProviderEvent({
          kind: "agent.status",
          status: text,
          turnId,
        });
      }
      emitProviderSignal({
        channel: "task",
        name: String(systemMessage.subtype),
        metadata: systemMessage,
        turnId,
      });
    }

    if (
      systemMessage.subtype === "hook_started" ||
      systemMessage.subtype === "hook_progress" ||
      systemMessage.subtype === "hook_response"
    ) {
      emitProviderSignal({
        channel: "hook",
        name: String(systemMessage.subtype),
        metadata: systemMessage,
        turnId,
      });
    }

    if (systemMessage.subtype === "local_command_output") {
      emitProviderSignal({
        channel: "system",
        name: "local_command_output",
        metadata: systemMessage,
        turnId,
      });
    }

    if (systemMessage.subtype === "compact_boundary") {
      emitProviderSignal({
        channel: "thread",
        name: "compact_boundary",
        metadata: systemMessage,
        turnId,
      });
    }

    if (systemMessage.subtype === "api_retry") {
      emitProviderSignal({
        channel: "system",
        name: "api_retry",
        metadata: systemMessage,
        turnId,
      });
    }

    if (systemMessage.subtype === "files_persisted") {
      emitProviderSignal({
        channel: "system",
        name: "files_persisted",
        metadata: systemMessage,
        turnId,
      });
    }

    if (systemMessage.subtype === "elicitation_complete") {
      emitProviderSignal({
        channel: "mcp",
        name: "elicitation_complete",
        metadata: systemMessage,
        turnId,
      });
    }
  }

  if (message.type === "rate_limit_event") {
    const rateLimitEvent = message as Record<string, unknown>;
    const info = rateLimitEvent.rate_limit_info as Record<string, unknown> | undefined;
    emitProviderEvent({
      kind: "agent.status",
      status: "rate_limited",
      detail: info ? `${info.status ?? "unknown"}` : undefined,
      turnId,
    });
    emitProviderSignal({
      channel: "account",
      name: "rate_limit",
      metadata: rateLimitEvent,
      turnId,
    });
    return "continue";
  }

  if (message.type === "prompt_suggestion") {
    emitProviderSignal({
      channel: "system",
      name: "prompt_suggestion",
      metadata: {
        suggestion: message.suggestion,
      },
      turnId,
    });
    return "continue";
  }

  if (message.type === "tool_use_summary") {
    emitProviderSignal({
      channel: "item",
      name: "tool_use_summary",
      metadata: {
        precedingToolUseIds: message.preceding_tool_use_ids,
        summary: message.summary,
      },
      turnId,
    });
    return "continue";
  }

  // Handle completed assistant messages — extract tool_use blocks that may not
  // have been emitted via stream_event (e.g. when permissions are bypassed).
  if (message.type === "assistant") {
    const betaMessage = (message as Record<string, unknown>).message as
      | Record<string, unknown>
      | undefined;
    const content = Array.isArray(betaMessage?.content)
      ? (betaMessage.content as Record<string, unknown>[])
      : [];
    for (const event of buildClaudeAssistantContentEvents({
      content,
      emittedBlockIds: streamState.emittedAssistantBlockIds,
      emittedToolUseIds: streamState.emittedToolUseIds,
      round: streamState.assistantRound,
      turnId,
    })) {
      emitProviderEvent(event);
    }
    // Bump the round so the next API response (after tool execution)
    // gets unique block IDs and isn't silently deduped.
    streamState.assistantRound++;
    return "continue";
  }

  if (message.type === "result") {
    return "result";
  }

  return "continue";
}

export async function runClaudeProvider(input: ClaudeProviderInput): Promise<number> {
  process.chdir(input.workspacePath);

  const pendingApprovals = new Map<string, PendingClaudeApproval>();
  let currentTurnId: string | null = null;
  // eslint-disable-next-line prefer-const -- assigned asynchronously inside processTurn
  let currentTurnAbort = null as AbortController | null;
  let cancelledTurnId: string | null = null;
  let currentTurnStreamState: ClaudeTurnStreamState | null = null;
  let turnQueue = Promise.resolve();

  // The claude-agent-sdk can throw unhandled rejections for internal tool
  // errors (e.g. MaxFileReadTokenExceededError) that bypass the stream
  // iterator. Catch these so the provider process stays alive.
  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const turnId = currentTurnId;
    if (turnId) {
      emitProviderEvent({
        kind: "agent.turn.failed",
        error: message,
        turnId,
      });
    } else {
      emitProviderEvent({
        kind: "agent.turn.failed",
        error: message,
        turnId: "unknown",
      });
    }
  });

  const sessionCallbacks = {
    canUseTool: async (
      toolName: string,
      rawInput: unknown,
      options: Parameters<CanUseTool>[2],
    ): Promise<PermissionResult> => {
      const inputRecord = isRecord(rawInput) ? rawInput : { value: rawInput };
      const approvalId = options.toolUseID?.trim() || randomUUID();
      const turnId = currentTurnId ?? approvalId;
      emitRawProviderEvent(
        "claude.callback.canUseTool",
        {
          input: inputRecord,
          options: {
            blockedPath: options.blockedPath ?? null,
            decisionReason: options.decisionReason ?? null,
            description: options.description ?? null,
            displayName: options.displayName ?? null,
            suggestions: options.suggestions ?? null,
            title: options.title ?? null,
            toolUseID: options.toolUseID ?? null,
          },
          toolName,
        },
        turnId,
      );

      currentTurnStreamState?.emittedToolUseIds.add(approvalId);
      for (const event of buildClaudeToolUseEvents({
        toolInput: inputRecord,
        toolName,
        toolUseId: approvalId,
        turnId,
      })) {
        emitProviderEvent(event);
      }

      emitProviderRequest({
        request: {
          id: approvalId,
          kind: "approval",
          title: buildClaudeToolApprovalMessage(toolName, inputRecord, {
            ...(options.displayName ? { displayName: options.displayName } : {}),
            ...(options.title ? { title: options.title } : {}),
          }),
          itemId: options.toolUseID ?? null,
          metadata: {
            method: "claude.callback.canUseTool",
            toolName,
            toolUseId: options.toolUseID ?? null,
          },
        },
        turnId,
      });

      const resolution = await createPendingApprovalPromise(
        {
          id: approvalId,
          kind: mapClaudeToolToApprovalKind(toolName, inputRecord),
          message: buildClaudeToolApprovalMessage(toolName, inputRecord, {
            ...(options.displayName ? { displayName: options.displayName } : {}),
            ...(options.title ? { title: options.title } : {}),
          }),
          metadata: {
            blockedPath: options.blockedPath ?? null,
            decisionReason: options.decisionReason ?? null,
            description: options.description ?? null,
            displayName: options.displayName ?? null,
            input: inputRecord,
            suggestions: options.suggestions ?? null,
            title: options.title ?? null,
            toolName,
            toolUseId: options.toolUseID,
          },
          scopeKey: `${toolName}:${options.blockedPath ?? options.toolUseID ?? approvalId}`,
          status: "pending",
        },
        pendingApprovals,
        turnId,
        options.signal,
      );

      emitProviderEvent({
        kind: "agent.approval.resolved",
        resolution: {
          approvalId,
          decision: resolution.decision,
          response: resolution.response ?? null,
        },
        turnId,
      });
      emitProviderRequestResolution({
        resolution: {
          requestId: approvalId,
          outcome: resolution.decision === "reject" ? "rejected" : "approved",
          response: resolution.response ?? null,
          metadata: {
            decision: resolution.decision,
            method: "claude.callback.canUseTool",
            toolName,
          },
        },
        turnId,
      });

      if (resolution.decision === "reject") {
        return {
          behavior: "deny",
          message: "User denied this action.",
          toolUseID: approvalId,
        };
      }

      return {
        behavior: "allow",
        toolUseID: approvalId,
        updatedInput: normalizeApprovalResponse(resolution.response, inputRecord),
        ...(resolution.decision === "approve_session" && options.suggestions
          ? { updatedPermissions: options.suggestions }
          : {}),
      };
    },
    onElicitation: async (request: ElicitationRequest): Promise<ElicitationResult> => {
      const approvalId = request.elicitationId?.trim() || randomUUID();
      const turnId = currentTurnId ?? approvalId;
      emitRawProviderEvent("claude.callback.onElicitation", request, turnId);
      emitProviderRequest({
        request: {
          id: approvalId,
          kind: "user_input",
          title: request.message,
          metadata: {
            elicitationId: request.elicitationId ?? null,
            method: "claude.callback.onElicitation",
            mode: request.mode ?? null,
            requestedSchema: request.requestedSchema ?? null,
            serverName: request.serverName,
            url: request.url ?? null,
          },
        },
        turnId,
      });
      const resolution = await createPendingApprovalPromise(
        {
          id: approvalId,
          kind: "question",
          message: request.message,
          metadata: {
            elicitationId: request.elicitationId ?? null,
            mode: request.mode ?? null,
            requestedSchema: request.requestedSchema ?? null,
            serverName: request.serverName,
            url: request.url ?? null,
          },
          scopeKey: `elicitation:${request.serverName}:${approvalId}`,
          status: "pending",
        },
        pendingApprovals,
        turnId,
      );

      emitProviderEvent({
        kind: "agent.approval.resolved",
        resolution: {
          approvalId,
          decision: resolution.decision,
          response: resolution.response ?? null,
        },
        turnId,
      });
      emitProviderRequestResolution({
        resolution: {
          requestId: approvalId,
          outcome: resolution.decision === "reject" ? "rejected" : "submitted",
          response: resolution.response ?? null,
          metadata: {
            decision: resolution.decision,
            method: "claude.callback.onElicitation",
            serverName: request.serverName,
          },
        },
        turnId,
      });

      if (resolution.decision === "reject") {
        return { action: "decline" } as ElicitationResult;
      }

      return {
        action: "accept",
        ...(resolution.response && isRecord(resolution.response)
          ? { content: resolution.response }
          : {}),
      } as ElicitationResult;
    },
  };

  let { providerId: initialProviderId, session } = createClaudeProviderSession(
    input,
    sessionCallbacks,
  );
  let resolvedProviderId = initialProviderId;

  if (resolvedProviderId) {
    emitProviderEvent({
      kind: "agent.ready",
      providerId: resolvedProviderId,
    });
  }

  async function emitReadyIfNeeded(message: SDKMessage): Promise<void> {
    const providerId =
      "session_id" in message && typeof message.session_id === "string"
        ? message.session_id.trim()
        : "";

    if (providerId.length > 0 && providerId !== resolvedProviderId) {
      resolvedProviderId = providerId;
      emitProviderEvent({
        kind: "agent.ready",
        providerId,
      });
    }
  }

  let sessionClosed = false;
  let firstTurnText: string | null = null;
  let titleGenerated = false;

  async function processTurn(
    command: Extract<AgentCommand, { kind: "agent.send_turn" }>,
  ): Promise<void> {
    // Resume session if it was closed by a previous interrupt.
    if (sessionClosed && resolvedProviderId) {
      const resumed = createClaudeProviderSession(
        { ...input, providerId: resolvedProviderId },
        sessionCallbacks,
      );
      session = resumed.session;
      sessionClosed = false;
    }

    currentTurnId = command.turnId;
    currentTurnStreamState = createClaudeTurnStreamState();
    const abort = new AbortController();
    currentTurnAbort = abort;

    // Fire-and-forget title generation as soon as the first message arrives.
    if (!titleGenerated && firstTurnText === null) {
      const text = extractTextFromInput(
        Array.isArray(command.input)
          ? command.input
          : [{ type: "text" as const, text: command.input as string }],
      );
      firstTurnText = text.length > 0 ? text : null;
      if (firstTurnText) {
        titleGenerated = true;
        void generateSessionTitle(firstTurnText, input.loginMethod).then((title) => {
          if (title) {
            emitProviderEvent({ kind: "agent.title_generated", title });
          }
        });
      }
    }

    try {
      const inputParts = Array.isArray(command.input)
        ? command.input
        : [{ type: "text" as const, text: command.input as string }];
      const content = inputParts.map((part) => {
        if (part.type === "image") {
          return {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: part.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              data: part.base64Data,
            },
          };
        }
        return { type: "text" as const, text: part.text };
      });
      const userMessage: SDKUserMessage = {
        type: "user",
        session_id: "",
        message: {
          role: "user",
          content,
        },
        parent_tool_use_id: null,
      };

      await session.send(userMessage);
      let sawResult = false;

      for await (const message of session.stream()) {
        if (abort.signal.aborted) {
          break;
        }
        await emitReadyIfNeeded(message);
        const action = handleStreamMessage(
          message,
          command.turnId,
          currentTurnStreamState,
          abort.signal,
        );

        if (action !== "result") {
          continue;
        }

        sawResult = true;
        const resultMessage = message as SDKResultMessage;
        const failure = extractFailure(resultMessage);
        if (failure) {
          emitProviderEvent({
            kind: "agent.turn.failed",
            error: failure,
            turnId: command.turnId,
          });
        } else {
          emitProviderEvent({
            kind: "agent.turn.completed",
            turnId: command.turnId,
            usage: extractUsage(resultMessage),
            costUsd: extractCost(resultMessage),
          });
        }
        break;
      }

      if (abort.signal.aborted) {
        // Reject any pending approvals so they don't dangle.
        for (const [id, pending] of pendingApprovals) {
          if (pending.turnId === command.turnId) {
            pendingApprovals.delete(id);
            pending.resolve({ decision: "reject", response: { message: "Turn interrupted." } });
          }
        }
        // Only emit if the cancel handler didn't already fire the event.
        if (cancelledTurnId !== command.turnId) {
          emitProviderEvent({
            kind: "agent.turn.failed",
            error: "interrupted",
            turnId: command.turnId,
          });
        }
      } else if (!sawResult) {
        emitProviderEvent({
          kind: "agent.turn.failed",
          error: "Claude stream ended without a result.",
          turnId: command.turnId,
        });
      }
    } catch (error) {
      if (abort.signal.aborted) {
        // Only emit if the cancel handler didn't already fire the event.
        if (cancelledTurnId !== command.turnId) {
          emitProviderEvent({
            kind: "agent.turn.failed",
            error: "interrupted",
            turnId: command.turnId,
          });
        }
      } else {
        emitProviderEvent({
          kind: "agent.turn.failed",
          error: error instanceof Error ? error.message : "Claude turn failed.",
          turnId: command.turnId,
        });
      }
    } finally {
      currentTurnId = null;
      currentTurnAbort = null;
      currentTurnStreamState = null;
      if (cancelledTurnId === command.turnId) {
        cancelledTurnId = null;
      }
    }
  }

  function resolvePendingApproval(
    command: Extract<AgentCommand, { kind: "agent.resolve_approval" }>,
  ): void {
    const pendingApproval = pendingApprovals.get(command.approvalId);
    if (!pendingApproval) {
      emitProviderEvent({
        kind: "agent.turn.failed",
        error: `Claude approval was not pending: ${command.approvalId}`,
        turnId: currentTurnId ?? command.approvalId,
      });
      return;
    }

    pendingApprovals.delete(command.approvalId);
    pendingApproval.resolve({
      decision: command.decision,
      response: command.response ?? null,
    });
  }

  const reader = createInterface({ crlfDelay: Infinity, input: process.stdin });
  process.stdin.resume();

  for await (const line of reader) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const command = normalizeCommand(trimmed);
    switch (command.kind) {
      case "agent.send_turn":
        turnQueue = turnQueue.catch(() => undefined).then(() => processTurn(command));
        break;
      case "agent.cancel_turn": {
        const abort = currentTurnAbort;
        if (abort) {
          const turnId = currentTurnId ?? command.turnId ?? "cancelled";
          abort.abort();
          // Force-break the stream so we don't wait for the next SDK message.
          session.close();
          sessionClosed = true;
          // Emit immediately so the UI unblocks — don't wait for the stream to drain.
          cancelledTurnId = turnId;
          emitProviderEvent({
            kind: "agent.turn.failed",
            error: "interrupted",
            turnId,
          });
        } else {
          emitProviderEvent({
            kind: "agent.turn.failed",
            error: "No active turn to cancel.",
            turnId: command.turnId ?? "cancelled",
          });
        }
        break;
      }
      case "agent.resolve_approval":
        resolvePendingApproval(command);
        break;
      case "agent.resolve_request":
        resolvePendingApproval({
          approvalId: command.requestId,
          decision: mapRequestOutcomeToApprovalDecision(command.outcome),
          kind: "agent.resolve_approval",
          response: command.response ?? null,
        });
        break;
    }
  }

  await turnQueue;
  if (!sessionClosed) {
    session.close();
  }
  return 0;
}

export function createClaudeProviderSession(
  input: ClaudeProviderInput,
  callbacks?: {
    canUseTool?: CanUseTool;
    onElicitation?: OnElicitation;
  },
): {
  providerId: string | null;
  session: SDKSession;
} {
  const hasMcpServers = input.mcpServers && Object.keys(input.mcpServers).length > 0;

  // When MCP servers are configured, use the V1 query() API which supports
  // mcpServers directly. The V2 session API hardcodes mcpServers to {}.
  if (hasMcpServers) {
    return createClaudeProviderSessionV1(input, callbacks);
  }

  const sessionOptions = {
    ...(input.effort ? { effort: input.effort } : {}),
    cwd: input.workspacePath,
    model: input.model,
    permissionMode: input.permissionMode,
    allowDangerouslySkipPermissions: input.dangerousSkipPermissions,
    includePartialMessages: true,
    env: buildSessionEnv(input.loginMethod),
    settingSources: ["project" as const],
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: LIFECYCLE_SYSTEM_PROMPT,
    },
    ...(callbacks?.canUseTool ? { canUseTool: callbacks.canUseTool } : {}),
    ...(callbacks?.onElicitation ? { onElicitation: callbacks.onElicitation } : {}),
  };

  if (input.providerId?.trim()) {
    const providerId = input.providerId.trim();
    return {
      providerId,
      session: unstable_v2_resumeSession(providerId, sessionOptions),
    };
  }

  return {
    providerId: null,
    session: unstable_v2_createSession(sessionOptions),
  };
}

/**
 * Creates a session using the V1 query() API, which supports mcpServers.
 * Returns an SDKSession-compatible wrapper around the Query object.
 */
function createClaudeProviderSessionV1(
  input: ClaudeProviderInput,
  callbacks?: {
    canUseTool?: CanUseTool;
    onElicitation?: OnElicitation;
  },
): {
  providerId: string | null;
  session: SDKSession;
} {
  if (!createQuery) {
    throw new Error(
      "Installed Claude SDK does not expose query(); MCP-backed sessions unavailable.",
    );
  }

  const queryOptions = {
    ...(input.effort ? { effort: input.effort } : {}),
    cwd: input.workspacePath,
    model: input.model,
    permissionMode: input.permissionMode,
    allowDangerouslySkipPermissions: input.dangerousSkipPermissions,
    env: buildSessionEnv(input.loginMethod),
    settingSources: ["project" as const],
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: LIFECYCLE_SYSTEM_PROMPT,
    },
    mcpServers: input.mcpServers as Record<
      string,
      { type?: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
    >,
    ...(callbacks?.canUseTool ? { canUseTool: callbacks.canUseTool } : {}),
    ...(callbacks?.onElicitation ? { onElicitation: callbacks.onElicitation } : {}),
    ...(input.providerId?.trim() ? { resume: input.providerId.trim() } : {}),
  };

  // Create an async channel for multi-turn input.
  let pushMessage: ((msg: SDKUserMessage) => void) | null = null;
  let endInput: (() => void) | null = null;

  const inputStream: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]() {
      const queue: SDKUserMessage[] = [];
      let resolve: ((result: IteratorResult<SDKUserMessage>) => void) | null = null;
      let done = false;

      pushMessage = (msg) => {
        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ done: false, value: msg });
        } else {
          queue.push(msg);
        }
      };

      endInput = () => {
        done = true;
        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ done: true, value: undefined });
        }
      };

      return {
        next() {
          if (queue.length > 0) {
            return Promise.resolve({ done: false as const, value: queue.shift()! });
          }
          if (done) {
            return Promise.resolve({ done: true as const, value: undefined });
          }
          return new Promise<IteratorResult<SDKUserMessage>>((r) => {
            resolve = r;
          });
        },
      };
    },
  };

  const q = createQuery({ prompt: inputStream, options: queryOptions });

  let resolvedSessionId: string | null = null;

  // Buffer messages from the query so stream() can be called multiple times
  // (once per turn). Messages are buffered until consumed.
  const messageBuffer: SDKMessage[] = [];
  let bufferResolve: ((msg: SDKMessage | null) => void) | null = null;
  let queryDone = false;

  function deliverToBuffer(msg: SDKMessage | null): void {
    const cb = bufferResolve;
    if (cb) {
      bufferResolve = null;
      cb(msg);
    } else if (msg) {
      messageBuffer.push(msg);
    }
  }

  // Start consuming the query in the background.
  void (async () => {
    try {
      for await (const message of q) {
        if (message.type === "system" && "session_id" in message) {
          resolvedSessionId = (message as { session_id?: string }).session_id ?? null;
        }
        deliverToBuffer(message);
      }
    } finally {
      queryDone = true;
      deliverToBuffer(null);
    }
  })();

  function nextBufferedMessage(): Promise<SDKMessage | null> {
    if (messageBuffer.length > 0) {
      return Promise.resolve(messageBuffer.shift()!);
    }
    if (queryDone) {
      return Promise.resolve(null);
    }
    return new Promise((r) => {
      bufferResolve = r;
    });
  }

  const session: SDKSession = {
    get sessionId(): string {
      if (!resolvedSessionId) throw new Error("Session ID not yet available");
      return resolvedSessionId;
    },
    async send(message: string | SDKUserMessage): Promise<void> {
      const msg: SDKUserMessage =
        typeof message === "string"
          ? {
              type: "user",
              session_id: "",
              message: { role: "user", content: [{ type: "text", text: message }] },
              parent_tool_use_id: null,
            }
          : message;
      pushMessage?.(msg);
    },
    async *stream(): AsyncGenerator<SDKMessage, void> {
      while (true) {
        const message = await nextBufferedMessage();
        if (message === null) return;
        yield message;
        // Pause after yielding a result so the caller can process the turn.
        if (message.type === "result") return;
      }
    },
    close(): void {
      endInput?.();
      q.return(undefined);
    },
    async [Symbol.asyncDispose](): Promise<void> {
      this.close();
    },
  };

  return {
    providerId: input.providerId?.trim() ?? null,
    session,
  };
}
