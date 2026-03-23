import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import {
  unstable_v2_createSession,
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
} from "../../worker-protocol";
import { buildSessionEnv, type ClaudeLoginMethod } from "./env";

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
  model: string;
  permissionMode: ClaudeWorkerPermissionMode;
  providerSessionId?: string;
  workspacePath: string;
}

interface PendingClaudeApproval {
  approval: AgentWorkerApprovalRequestPayload;
  resolve: (resolution: { decision: "approve_once" | "approve_session" | "reject"; response?: Record<string, unknown> | null }) => void;
  turnId: string;
}

function emitWorkerEvent(event: AgentWorkerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractResultText(message: SDKResultMessage): string {
  if (message.subtype !== "success") {
    return "";
  }
  return typeof message.result === "string" ? message.result.trim() : "";
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
): { input_tokens: number; output_tokens: number; cache_read_tokens?: number | undefined } | undefined {
  if (!("usage" in message) || !message.usage) {
    return undefined;
  }
  const usage = message.usage as Record<string, number>;
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? undefined,
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
): Promise<{ decision: "approve_once" | "approve_session" | "reject"; response?: Record<string, unknown> | null }> {
  emitWorkerEvent({
    kind: "agent.approval.requested",
    approval,
    turn_id: turnId,
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
const activeToolBlocks = new Map<number, { tool_name: string; tool_use_id: string; inputChunks: string[] }>();

function handleStreamMessage(message: SDKMessage, turnId: string): "result" | "continue" {
  if (message.type === "auth_status") {
    emitWorkerEvent({
      kind: "worker.auth_status",
      is_authenticating: message.isAuthenticating,
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
          tool_name: block.name,
          tool_use_id: toolUseId,
          inputChunks: [],
        });
        emitWorkerEvent({
          kind: "agent.tool_use.start",
          tool_name: block.name,
          tool_use_id: toolUseId,
          turn_id: turnId,
        });
      }
    } else if (event.type === "content_block_delta") {
      const blockIndex = (event.index as number) ?? 0;
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        emitWorkerEvent({
          kind: "agent.message.delta",
          text: delta.text,
          turn_id: turnId,
          block_index: blockIndex,
        });
      } else if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
        emitWorkerEvent({
          kind: "agent.thinking.delta",
          text: delta.thinking,
          turn_id: turnId,
          block_index: blockIndex,
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
            tool_name: toolBlock.tool_name,
            tool_use_id: toolBlock.tool_use_id,
            input_json: inputJson,
            turn_id: turnId,
          });
        }
        activeToolBlocks.delete(blockIndex);
      }
    }

    return "continue";
  }

  if (message.type === "tool_progress") {
    emitWorkerEvent({
      kind: "agent.tool_progress",
      tool_name: message.tool_name,
      tool_use_id: message.tool_use_id,
      elapsed_time_seconds: message.elapsed_time_seconds,
      turn_id: turnId,
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
          turn_id: turnId,
        });
      }
    }

    if (systemMessage.subtype === "task_started") {
      emitWorkerEvent({
        kind: "agent.item.started",
        item: {
          id: (systemMessage.task_id as string) ?? randomUUID(),
          type: "agent_message",
          text: (systemMessage.description as string) ?? "",
        },
        turn_id: turnId,
      });
    }

    if (systemMessage.subtype === "task_progress") {
      emitWorkerEvent({
        kind: "agent.item.updated",
        item: {
          id: (systemMessage.task_id as string) ?? "",
          type: "agent_message",
          text: (systemMessage.summary as string) ?? (systemMessage.description as string) ?? "",
        },
        turn_id: turnId,
      });
    }

    if (systemMessage.subtype === "task_notification") {
      emitWorkerEvent({
        kind: "agent.item.completed",
        item: {
          id: (systemMessage.task_id as string) ?? "",
          type: "agent_message",
          text: (systemMessage.summary as string) ?? "",
        },
        turn_id: turnId,
      });
    }
  }

  if (message.type === "rate_limit_event") {
    const rateLimitEvent = message as Record<string, unknown>;
    const info = rateLimitEvent.rate_limit_info as Record<string, unknown> | undefined;
    emitWorkerEvent({
      kind: "agent.status",
      status: "rate_limited",
      detail: info ? `${info.status ?? "unknown"}` : undefined,
      turn_id: turnId,
    });
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
  let turnQueue = Promise.resolve();

  const { providerSessionId: initialProviderSessionId, session } = createClaudeWorkerSession(input, {
    canUseTool: async (toolName, rawInput, options): Promise<PermissionResult> => {
      const inputRecord = isRecord(rawInput) ? rawInput : { value: rawInput };
      const approvalId = options.toolUseID?.trim() || randomUUID();
      const turnId = currentTurnId ?? approvalId;
      const resolution = await createPendingApprovalPromise(
        {
          id: approvalId,
          kind: mapClaudeToolToApprovalKind(toolName, inputRecord),
          message: buildClaudeToolApprovalMessage(toolName, inputRecord, {
            ...(options.displayName ? { displayName: options.displayName } : {}),
            ...(options.title ? { title: options.title } : {}),
          }),
          metadata: {
            blocked_path: options.blockedPath ?? null,
            decision_reason: options.decisionReason ?? null,
            description: options.description ?? null,
            display_name: options.displayName ?? null,
            input: inputRecord,
            suggestions: options.suggestions ?? null,
            title: options.title ?? null,
            tool_name: toolName,
            tool_use_id: options.toolUseID,
          },
          scope_key: `${toolName}:${options.blockedPath ?? options.toolUseID ?? approvalId}`,
          status: "pending",
        },
        pendingApprovals,
        turnId,
        options.signal,
      );

      emitWorkerEvent({
        kind: "agent.approval.resolved",
        resolution: {
          approval_id: approvalId,
          decision: resolution.decision,
          response: resolution.response ?? null,
        },
        turn_id: turnId,
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
            requested_schema: request.requestedSchema ?? null,
            server_name: request.serverName,
            url: request.url ?? null,
          },
          scope_key: `elicitation:${request.serverName}:${approvalId}`,
          status: "pending",
        },
        pendingApprovals,
        turnId,
      );

      emitWorkerEvent({
        kind: "agent.approval.resolved",
        resolution: {
          approval_id: approvalId,
          decision: resolution.decision,
          response: resolution.response ?? null,
        },
        turn_id: turnId,
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
  });
  let resolvedProviderSessionId = initialProviderSessionId;

  if (resolvedProviderSessionId) {
    emitWorkerEvent({
      kind: "worker.ready",
      provider_session_id: resolvedProviderSessionId,
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
        provider_session_id: providerSessionId,
      });
    }
  }

  async function processTurn(command: Extract<AgentWorkerCommand, { kind: "worker.send_turn" }>): Promise<void> {
    currentTurnId = command.turn_id;
    try {
      const userMessage: SDKUserMessage = {
        type: "user",
        session_id: "",
        message: {
          role: "user",
          content: [{ type: "text", text: command.input }],
        },
        parent_tool_use_id: null,
      };

      await session.send(userMessage);
      let sawResult = false;

      for await (const message of session.stream()) {
        await emitReadyIfNeeded(message);
        const action = handleStreamMessage(message, command.turn_id);

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
            turn_id: command.turn_id,
          });
        } else {
          const text = extractResultText(resultMessage);
          if (text.length > 0) {
            emitWorkerEvent({
              kind: "agent.item.completed",
              item: {
                id: `${command.turn_id}:assistant`,
                type: "agent_message",
                text,
              },
              turn_id: command.turn_id,
            });
          }

          emitWorkerEvent({
            kind: "agent.turn.completed",
            turn_id: command.turn_id,
            usage: extractUsage(resultMessage),
            cost_usd: extractCost(resultMessage),
          });
        }
        break;
      }

      if (!sawResult) {
        emitWorkerEvent({
          kind: "agent.turn.failed",
          error: "Claude stream ended without a result.",
          turn_id: command.turn_id,
        });
      }
    } catch (error) {
      emitWorkerEvent({
        kind: "agent.turn.failed",
        error: error instanceof Error ? error.message : "Claude turn failed.",
        turn_id: command.turn_id,
      });
    } finally {
      currentTurnId = null;
    }
  }

  function resolvePendingApproval(
    command: Extract<AgentWorkerCommand, { kind: "worker.resolve_approval" }>,
  ): void {
    const pendingApproval = pendingApprovals.get(command.approval_id);
    if (!pendingApproval) {
      emitWorkerEvent({
        kind: "agent.turn.failed",
        error: `Claude approval was not pending: ${command.approval_id}`,
        turn_id: currentTurnId ?? command.approval_id,
      });
      return;
    }

    pendingApprovals.delete(command.approval_id);
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
      case "worker.cancel_turn":
        emitWorkerEvent({
          kind: "agent.turn.failed",
          error: "Claude turn cancellation is not supported yet.",
          turn_id: command.turn_id ?? "cancelled",
        });
        break;
      case "worker.resolve_approval":
        resolvePendingApproval(command);
        break;
    }
  }

  await turnQueue;
  session.close();
  return 0;
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
  const sessionOptions = {
    ...(input.effort ? { effort: input.effort } : {}),
    model: input.model,
    permissionMode: input.permissionMode,
    allowDangerouslySkipPermissions: input.dangerousSkipPermissions,
    includePartialMessages: true,
    env: buildSessionEnv(input.loginMethod),
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
