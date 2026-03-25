import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
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
  AgentWorkerApprovalRequestPayload,
  AgentWorkerCommand,
  AgentWorkerEvent,
  AgentWorkerInputPart,
} from "../../worker-protocol";
import { LIFECYCLE_SYSTEM_PROMPT } from "../../system-prompt";
import { buildSessionEnv, type ClaudeLoginMethod } from "./env";

// ---------------------------------------------------------------------------
// Lightweight title generation — spins up a minimal SDK session so it shares
// the same auth (OAuth / API key) as the main agent session.
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

function extractTextFromInput(parts: AgentWorkerInputPart[]): string {
  return parts
    .filter((p): p is Extract<AgentWorkerInputPart, { type: "text" }> => p.type === "text")
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

export type ClaudeWorkerPermissionMode =
  | "acceptEdits"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan";

export { type ClaudeLoginMethod } from "./env";

export interface ClaudeWorkerInput {
  dangerousSkipPermissions: boolean;
  effort?: "low" | "medium" | "high" | "max";
  loginMethod: ClaudeLoginMethod;
  mcpServers?: Record<string, { type?: "stdio"; command: string; args?: string[]; env?: Record<string, string> }>;
  model: string;
  permissionMode: ClaudeWorkerPermissionMode;
  providerSessionId?: string;
  workspacePath: string;
}

interface PendingClaudeApproval {
  approval: AgentWorkerApprovalRequestPayload;
  resolve: (resolution: {
    decision: "approve_once" | "approve_session" | "reject";
    response?: Record<string, unknown> | null;
  }) => void;
  turnId: string;
}

function emitWorkerEvent(event: AgentWorkerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
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

function normalizeCommand(raw: string): AgentWorkerCommand {
  return JSON.parse(raw) as AgentWorkerCommand;
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

function getClaudeAssistantBlockKey(turnId: string, blockId: string): string {
  return `${turnId}:${blockId}`;
}

function buildClaudeTextDeltaEvent(input: {
  blockId: string;
  emittedBlockIds: Set<string>;
  text: string;
  turnId: string;
}): AgentWorkerEvent | null {
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
}): AgentWorkerEvent | null {
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
}): AgentWorkerEvent[] {
  const events: AgentWorkerEvent[] = [
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
}): AgentWorkerEvent[] {
  const events: AgentWorkerEvent[] = [];
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
): AgentWorkerApprovalRequestPayload["kind"] {
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
  approval: AgentWorkerApprovalRequestPayload,
  pendingApprovals: Map<string, PendingClaudeApproval>,
  turnId: string,
  signal?: AbortSignal,
): Promise<{
  decision: "approve_once" | "approve_session" | "reject";
  response?: Record<string, unknown> | null;
}> {
  emitWorkerEvent({
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

// Track active tool blocks so we can emit their accumulated input on block stop.
const activeToolBlocks = new Map<
  number,
  { toolName: string; toolUseId: string; inputChunks: string[] }
>();

// Track tool_use IDs that have already been emitted to avoid duplicates.
// Events can come from both streaming (content_block_start/stop) and assistant message.
const emittedToolUseIds = new Set<string>();
const emittedAssistantBlockIds = new Set<string>();
// Track which API round we're in within a turn. The SDK reuses block indices
// (0, 1, ...) for each round, so without a round counter the dedup set
// silently drops text/thinking blocks from rounds after the first.
let assistantRound = 0;

function handleStreamMessage(
  message: SDKMessage,
  turnId: string,
  signal?: AbortSignal,
): "result" | "continue" {
  // Skip emitting streaming events after abort — the turn is already cancelled.
  // Still process "result" messages so the stream loop can terminate cleanly.
  if (signal?.aborted && message.type !== "result") {
    return "continue";
  }

  if (message.type === "auth_status") {
    emitWorkerEvent({
      kind: "worker.auth_status",
      isAuthenticating: message.isAuthenticating,
      output: message.output,
      ...(message.error ? { error: message.error } : {}),
    });
    return "continue";
  }

  if (message.type === "stream_event") {
    const event = message.event as Record<string, unknown>;

    if (event.type === "content_block_start") {
      const blockIndex = (event.index as number) ?? 0;
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use" && typeof block.name === "string") {
        const toolUseId = (block.id as string) ?? "";
        activeToolBlocks.set(blockIndex, {
          toolName: block.name,
          toolUseId,
          inputChunks: [],
        });
        emitWorkerEvent({
          kind: "agent.tool_use.start",
          toolName: block.name,
          toolUseId,
          turnId,
        });
      }
    } else if (event.type === "content_block_delta") {
      const blockIndex = (event.index as number) ?? 0;
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        // Mark this block as emitted so the assistant-message catchup path
        // (`buildClaudeAssistantContentEvents`) won't re-emit the full text.
        const blockId = `text:${assistantRound}:${blockIndex}`;
        emittedAssistantBlockIds.add(getClaudeAssistantBlockKey(turnId, blockId));
        emitWorkerEvent({
          kind: "agent.message.delta",
          text: delta.text,
          turnId,
          blockId,
        });
      } else if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
        const blockId = `thinking:${assistantRound}:${blockIndex}`;
        emittedAssistantBlockIds.add(getClaudeAssistantBlockKey(turnId, blockId));
        emitWorkerEvent({
          kind: "agent.thinking.delta",
          text: delta.thinking,
          turnId,
          blockId,
        });
      } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const toolBlock = activeToolBlocks.get(blockIndex);
        if (toolBlock) {
          toolBlock.inputChunks.push(delta.partial_json);
        }
      }
    } else if (event.type === "content_block_stop") {
      const blockIndex = (event.index as number) ?? 0;
      const toolBlock = activeToolBlocks.get(blockIndex);
      if (toolBlock) {
        const inputJson = toolBlock.inputChunks.join("");
        if (inputJson.length > 0) {
          emitWorkerEvent({
            kind: "agent.tool_use.input",
            toolName: toolBlock.toolName,
            toolUseId: toolBlock.toolUseId,
            inputJson,
            turnId,
          });
        }
        emittedToolUseIds.add(toolBlock.toolUseId);
        activeToolBlocks.delete(blockIndex);
      }
    }

    return "continue";
  }

  if (message.type === "tool_progress") {
    emitWorkerEvent({
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

    if (systemMessage.subtype === "status") {
      const status = systemMessage.status as string | null;
      if (status) {
        emitWorkerEvent({
          kind: "agent.status",
          status,
          turnId,
        });
      }
    }

    if (
      systemMessage.subtype === "task_started" ||
      systemMessage.subtype === "task_progress" ||
      systemMessage.subtype === "task_notification"
    ) {
      const text =
        (systemMessage.summary as string) ?? (systemMessage.description as string) ?? "";
      if (text) {
        emitWorkerEvent({
          kind: "agent.status",
          status: text,
          turnId,
        });
      }
    }
  }

  if (message.type === "rate_limit_event") {
    const rateLimitEvent = message as Record<string, unknown>;
    const info = rateLimitEvent.rate_limit_info as Record<string, unknown> | undefined;
    emitWorkerEvent({
      kind: "agent.status",
      status: "rate_limited",
      detail: info ? `${info.status ?? "unknown"}` : undefined,
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
      emittedBlockIds: emittedAssistantBlockIds,
      emittedToolUseIds,
      round: assistantRound,
      turnId,
    })) {
      emitWorkerEvent(event);
    }
    // Bump the round so the next API response (after tool execution)
    // gets unique block IDs and isn't silently deduped.
    assistantRound++;
    return "continue";
  }

  if (message.type === "result") {
    return "result";
  }

  return "continue";
}

export async function runClaudeWorker(input: ClaudeWorkerInput): Promise<number> {
  process.chdir(input.workspacePath);

  const pendingApprovals = new Map<string, PendingClaudeApproval>();
  let currentTurnId: string | null = null;
  // eslint-disable-next-line prefer-const -- assigned asynchronously inside processTurn
  let currentTurnAbort = null as AbortController | null;
  let cancelledTurnId: string | null = null;
  let turnQueue = Promise.resolve();

  // The claude-agent-sdk can throw unhandled rejections for internal tool
  // errors (e.g. MaxFileReadTokenExceededError) that bypass the stream
  // iterator. Catch these so the worker process stays alive.
  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const turnId = currentTurnId;
    if (turnId) {
      emitWorkerEvent({
        kind: "agent.turn.failed",
        error: message,
        turnId,
      });
    } else {
      emitWorkerEvent({
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

      emittedToolUseIds.add(approvalId);
      for (const event of buildClaudeToolUseEvents({
        toolInput: inputRecord,
        toolName,
        toolUseId: approvalId,
        turnId,
      })) {
        emitWorkerEvent(event);
      }

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

      emitWorkerEvent({
        kind: "agent.approval.resolved",
        resolution: {
          approvalId,
          decision: resolution.decision,
          response: resolution.response ?? null,
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
      const resolution = await createPendingApprovalPromise(
        {
          id: approvalId,
          kind: "question",
          message: request.message,
          metadata: {
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

      emitWorkerEvent({
        kind: "agent.approval.resolved",
        resolution: {
          approvalId,
          decision: resolution.decision,
          response: resolution.response ?? null,
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

  let { providerSessionId: initialProviderSessionId, session } = createClaudeWorkerSession(
    input,
    sessionCallbacks,
  );
  let resolvedProviderSessionId = initialProviderSessionId;

  if (resolvedProviderSessionId) {
    emitWorkerEvent({
      kind: "worker.ready",
      providerSessionId: resolvedProviderSessionId,
    });
  }

  async function emitReadyIfNeeded(message: SDKMessage): Promise<void> {
    const providerSessionId =
      "session_id" in message && typeof message.session_id === "string"
        ? message.session_id.trim()
        : "";

    if (providerSessionId.length > 0 && providerSessionId !== resolvedProviderSessionId) {
      resolvedProviderSessionId = providerSessionId;
      emitWorkerEvent({
        kind: "worker.ready",
        providerSessionId,
      });
    }
  }

  let sessionClosed = false;
  let firstTurnText: string | null = null;
  let titleGenerated = false;

  async function processTurn(
    command: Extract<AgentWorkerCommand, { kind: "worker.send_turn" }>,
  ): Promise<void> {
    // Resume session if it was closed by a previous interrupt.
    if (sessionClosed && resolvedProviderSessionId) {
      const resumed = createClaudeWorkerSession(
        { ...input, providerSessionId: resolvedProviderSessionId },
        sessionCallbacks,
      );
      session = resumed.session;
      sessionClosed = false;
    }

    currentTurnId = command.turnId;
    assistantRound = 0;
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
            emitWorkerEvent({ kind: "worker.title_generated", title });
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
        const action = handleStreamMessage(message, command.turnId, abort.signal);

        if (action !== "result") {
          continue;
        }

        sawResult = true;
        const resultMessage = message as SDKResultMessage;
        const failure = extractFailure(resultMessage);
        if (failure) {
          emitWorkerEvent({
            kind: "agent.turn.failed",
            error: failure,
            turnId: command.turnId,
          });
        } else {
          emitWorkerEvent({
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
          emitWorkerEvent({
            kind: "agent.turn.failed",
            error: "interrupted",
            turnId: command.turnId,
          });
        }
      } else if (!sawResult) {
        emitWorkerEvent({
          kind: "agent.turn.failed",
          error: "Claude stream ended without a result.",
          turnId: command.turnId,
        });
      }
    } catch (error) {
      if (abort.signal.aborted) {
        // Only emit if the cancel handler didn't already fire the event.
        if (cancelledTurnId !== command.turnId) {
          emitWorkerEvent({
            kind: "agent.turn.failed",
            error: "interrupted",
            turnId: command.turnId,
          });
        }
      } else {
        emitWorkerEvent({
          kind: "agent.turn.failed",
          error: error instanceof Error ? error.message : "Claude turn failed.",
          turnId: command.turnId,
        });
      }
    } finally {
      currentTurnId = null;
      currentTurnAbort = null;
      if (cancelledTurnId === command.turnId) {
        cancelledTurnId = null;
      }
    }
  }

  function resolvePendingApproval(
    command: Extract<AgentWorkerCommand, { kind: "worker.resolve_approval" }>,
  ): void {
    const pendingApproval = pendingApprovals.get(command.approvalId);
    if (!pendingApproval) {
      emitWorkerEvent({
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
      case "worker.send_turn":
        turnQueue = turnQueue.catch(() => undefined).then(() => processTurn(command));
        break;
      case "worker.cancel_turn": {
        const abort = currentTurnAbort;
        if (abort) {
          const turnId = currentTurnId ?? command.turnId ?? "cancelled";
          abort.abort();
          // Force-break the stream so we don't wait for the next SDK message.
          session.close();
          sessionClosed = true;
          // Emit immediately so the UI unblocks — don't wait for the stream to drain.
          cancelledTurnId = turnId;
          emitWorkerEvent({
            kind: "agent.turn.failed",
            error: "interrupted",
            turnId,
          });
        } else {
          emitWorkerEvent({
            kind: "agent.turn.failed",
            error: "No active turn to cancel.",
            turnId: command.turnId ?? "cancelled",
          });
        }
        break;
      }
      case "worker.resolve_approval":
        resolvePendingApproval(command);
        break;
    }
  }

  await turnQueue;
  if (!sessionClosed) {
    session.close();
  }
  return 0;
}

function ensureProjectMcpSettings(
  workspacePath: string,
  mcpServers: NonNullable<ClaudeWorkerInput["mcpServers"]>,
): void {
  const claudeDir = join(workspacePath, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    } catch {
      // Start fresh if settings are corrupt.
    }
  }

  const existing = (settings.mcpServers ?? {}) as Record<string, unknown>;
  settings.mcpServers = { ...existing, ...mcpServers };

  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

export function createClaudeWorkerSession(
  input: ClaudeWorkerInput,
  callbacks?: {
    canUseTool?: CanUseTool;
    onElicitation?: OnElicitation;
  },
): {
  providerSessionId: string | null;
  session: SDKSession;
} {
  // Write MCP server config into the workspace's .claude/settings.json so the
  // SDK picks it up via settingSources: ["project"].
  if (input.mcpServers && Object.keys(input.mcpServers).length > 0) {
    ensureProjectMcpSettings(input.workspacePath, input.mcpServers);
  }

  const sessionOptions = {
    ...(input.effort ? { effort: input.effort } : {}),
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

  if (input.providerSessionId?.trim()) {
    const providerSessionId = input.providerSessionId.trim();
    return {
      providerSessionId,
      session: unstable_v2_resumeSession(providerSessionId, sessionOptions),
    };
  }

  return {
    providerSessionId: null,
    session: unstable_v2_createSession(sessionOptions),
  };
}
