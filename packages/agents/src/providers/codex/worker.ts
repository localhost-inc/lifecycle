import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { Codex } from "@openai/codex-sdk";
import { resolveCodexCliPath } from "./cli-path";
import type { AgentApprovalDecision, AgentApprovalKind } from "../../turn";
import { LIFECYCLE_SYSTEM_PROMPT } from "../../system-prompt";
import type {
  AgentWorkerApprovalRequestPayload,
  AgentWorkerCommand,
  AgentWorkerEvent,
  AgentWorkerInputPart,
  AgentWorkerItem,
  AgentWorkerItemStatus,
} from "../../worker/protocol";

// ---------------------------------------------------------------------------
// Lightweight title generation — uses the already-running app-server so it
// shares the same auth (ChatGPT OAuth / API key) as the main agent session.
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

async function generateSessionTitle(userText: string): Promise<string | null> {
  try {
    const codex = new Codex();
    const thread = codex.startThread({
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    });
    const prompt =
      "Generate a concise 3-5 word title for the following conversation prompt. " +
      "Respond with only the title, no quotes or extra punctuation.\n\n" +
      userText.slice(0, 500);
    const turn = await thread.run(prompt);
    const title = turn.finalResponse.trim();
    return title.length > 0 ? title : truncateTitle(userText);
  } catch {
    return truncateTitle(userText);
  }
}

export type CodexApprovalPolicy = "never" | "on-failure" | "on-request" | "untrusted";
export type CodexReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export interface CodexWorkerInput {
  approvalPolicy: CodexApprovalPolicy;
  dangerousBypass: boolean;
  model?: string | undefined;
  modelReasoningEffort?: CodexReasoningEffort | undefined;
  providerSessionId?: string | undefined;
  sandboxMode: CodexSandboxMode;
  workspacePath: string;
}

interface CodexJsonRpcError {
  code?: number;
  data?: unknown;
  message?: string;
}

interface CodexJsonRpcRequest {
  id: number | string;
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface CodexJsonRpcResponse {
  error?: CodexJsonRpcError;
  id: number | string;
  jsonrpc?: "2.0";
  result?: unknown;
}

interface PendingRpcRequest {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
}

interface PendingCodexApproval {
  approval: AgentWorkerApprovalRequestPayload;
  lifecycleTurnId: string;
  method: string;
  params: Record<string, unknown>;
  requestId: number | string;
}

interface CodexThreadBootstrapRequest {
  method: "thread/resume" | "thread/start";
  params: Record<string, unknown>;
}

function emitWorkerEvent(event: AgentWorkerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function emitRawProviderEvent(eventType: string, payload: unknown, turnId?: string | null): void {
  emitWorkerEvent({
    kind: "provider.raw_event",
    eventType,
    payload,
    ...(turnId === undefined ? {} : { turnId }),
  });
}

function normalizeCommand(raw: string): AgentWorkerCommand {
  return JSON.parse(raw) as AgentWorkerCommand;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = record[key];
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function toJsonString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function mapCodexStatus(status: string | undefined): AgentWorkerItemStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "declined":
    case "failed":
      return "failed";
    case "inProgress":
    default:
      return "running";
  }
}

function mapCodexThreadItemToWorkerItem(item: Record<string, unknown>): AgentWorkerItem | null {
  switch (readString(item, "type")) {
    case "agentMessage":
      return {
        id: readString(item, "id") ?? "",
        text: readString(item, "text") ?? "",
        type: "agent_message",
      };
    case "plan":
      return {
        id: readString(item, "id") ?? "",
        text: readString(item, "text") ?? "",
        type: "reasoning",
      };
    case "reasoning": {
      const summary = Array.isArray(item.summary)
        ? item.summary.filter((value): value is string => typeof value === "string")
        : [];
      const content = Array.isArray(item.content)
        ? item.content.filter((value): value is string => typeof value === "string")
        : [];
      return {
        id: readString(item, "id") ?? "",
        text: [...summary, ...content].join("\n\n"),
        type: "reasoning",
      };
    }
    case "commandExecution":
      return {
        command: readString(item, "command") ?? "",
        id: readString(item, "id") ?? "",
        output: readOptionalString(item, "aggregatedOutput") ?? "",
        status: mapCodexStatus(readString(item, "status")),
        type: "command_execution",
        ...(typeof readNumber(item, "exitCode") === "number"
          ? { exitCode: readNumber(item, "exitCode") ?? 0 }
          : {}),
      };
    case "fileChange":
      const changes = Array.isArray(item.changes)
        ? item.changes.flatMap((change) => {
            if (!isRecord(change)) {
              return [];
            }
            const path = readString(change, "path");
            const kind = readString(change, "kind");
            if (!path || (kind !== "add" && kind !== "delete" && kind !== "update")) {
              return [];
            }
            const diff = readString(change, "diff");
            return [{ ...(diff ? { diff } : {}), kind, path }] as const;
          })
        : [];
      const diff =
        readString(item, "diff") ??
        changes
          .map((change) => change.diff)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .join("\n");
      return {
        changes,
        ...(diff ? { diff } : {}),
        id: readString(item, "id") ?? "",
        status: mapCodexStatus(readString(item, "status")),
        type: "file_change",
      };
    case "mcpToolCall": {
      const result = item.result;
      const error = item.error;
      const inputJson = toJsonString(item.arguments);
      const outputJson = isRecord(result) ? toJsonString(result) : undefined;
      const errorText = isRecord(error) ? readString(error, "message") : undefined;
      return {
        id: readString(item, "id") ?? "",
        status: mapCodexStatus(readString(item, "status")),
        toolCallId: readString(item, "id") ?? "",
        toolName: `${readString(item, "server") ?? "mcp"}/${readString(item, "tool") ?? "tool"}`,
        type: "tool_call",
        ...(inputJson !== undefined ? { inputJson } : {}),
        ...(outputJson !== undefined ? { outputJson } : {}),
        ...(errorText !== undefined ? { errorText } : {}),
      };
    }
    case "dynamicToolCall": {
      const inputJson = toJsonString(item.arguments);
      const outputJson = toJsonString(item.contentItems);
      return {
        id: readString(item, "id") ?? "",
        status: mapCodexStatus(readString(item, "status")),
        toolCallId: readString(item, "id") ?? "",
        toolName: readString(item, "tool") ?? "tool",
        type: "tool_call",
        ...(inputJson !== undefined ? { inputJson } : {}),
        ...(outputJson !== undefined ? { outputJson } : {}),
      };
    }
    case "webSearch": {
      const inputJson = toJsonString({
        action: item.action,
        query: readString(item, "query") ?? "",
      });
      return {
        id: readString(item, "id") ?? "",
        status: "completed",
        toolCallId: readString(item, "id") ?? "",
        toolName: "web_search",
        type: "tool_call",
        ...(inputJson !== undefined ? { inputJson } : {}),
      };
    }
    case "collabAgentToolCall": {
      const inputJson = toJsonString({
        model: readOptionalString(item, "model"),
        prompt: readOptionalString(item, "prompt"),
        receiverThreadIds: item.receiverThreadIds,
        senderThreadId: readString(item, "senderThreadId"),
      });
      const outputJson = toJsonString(item.agentsStates);
      return {
        id: readString(item, "id") ?? "",
        status: mapCodexStatus(readString(item, "status")),
        toolCallId: readString(item, "id") ?? "",
        toolName: `collab/${readString(item, "tool") ?? "agent"}`,
        type: "tool_call",
        ...(inputJson !== undefined ? { inputJson } : {}),
        ...(outputJson !== undefined ? { outputJson } : {}),
      };
    }
    default:
      return null;
  }
}

export function codexThreadItemToWorkerItem(item: Record<string, unknown>): AgentWorkerItem | null {
  return mapCodexThreadItemToWorkerItem(item);
}

export function appendCodexCommandExecutionOutputDelta(
  item: Record<string, unknown>,
  delta: string,
): Record<string, unknown> {
  return {
    ...item,
    aggregatedOutput: `${readOptionalString(item, "aggregatedOutput") ?? ""}${delta}`,
  };
}

export function appendCodexFileChangeOutputDelta(
  item: Record<string, unknown>,
  delta: string,
): Record<string, unknown> {
  return {
    ...item,
    diff: `${readOptionalString(item, "diff") ?? ""}${delta}`,
  };
}

export function mergeCodexItemSnapshot(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  if (!previous) {
    return next;
  }

  const itemType = readString(next, "type");
  if (!itemType || readString(previous, "type") !== itemType) {
    return next;
  }

  switch (itemType) {
    case "commandExecution": {
      const merged = { ...previous, ...next };
      const previousOutput = readOptionalString(previous, "aggregatedOutput");
      const nextOutput = readOptionalString(next, "aggregatedOutput");
      if (
        typeof previousOutput === "string" &&
        previousOutput.length > 0 &&
        !(typeof nextOutput === "string" && nextOutput.length > 0)
      ) {
        merged.aggregatedOutput = previousOutput;
      }
      return merged;
    }
    case "fileChange": {
      const merged = { ...previous, ...next };
      const previousDiff = readOptionalString(previous, "diff");
      const nextDiff = readOptionalString(next, "diff");
      if (
        typeof previousDiff === "string" &&
        previousDiff.length > 0 &&
        !(typeof nextDiff === "string" && nextDiff.length > 0)
      ) {
        merged.diff = previousDiff;
      }
      return merged;
    }
    default:
      return next;
  }
}

export function buildCodexTurnDiffItem(
  lifecycleTurnId: string,
  diff: string,
  fileChangeItems: Record<string, unknown>[],
): Record<string, unknown> {
  const changes = fileChangeItems.flatMap((item) => {
    if (!Array.isArray(item.changes)) {
      return [];
    }

    return item.changes.filter((change): change is Record<string, unknown> => isRecord(change));
  });

  return {
    changes,
    diff,
    id: `${lifecycleTurnId}:turn-diff`,
    status: "inProgress",
    type: "fileChange",
  };
}

function buildCodexConfig(input: CodexWorkerInput): Record<string, unknown> | null {
  if (!input.modelReasoningEffort) {
    return null;
  }

  return {
    model_reasoning_effort: input.modelReasoningEffort,
  };
}

export function createCodexThreadBootstrapRequest(
  input: CodexWorkerInput,
): CodexThreadBootstrapRequest {
  const approvalPolicy = input.dangerousBypass ? "never" : input.approvalPolicy;
  const config = buildCodexConfig(input);
  const sandboxMode = input.dangerousBypass ? "danger-full-access" : input.sandboxMode;
  const shared: Record<string, unknown> = {
    approvalPolicy,
    cwd: input.workspacePath,
    developerInstructions: LIFECYCLE_SYSTEM_PROMPT,
    persistExtendedHistory: true,
    sandbox: sandboxMode,
    ...(input.model ? { model: input.model } : {}),
    ...(config ? { config } : {}),
  };

  if (input.providerSessionId?.trim()) {
    return {
      method: "thread/resume",
      params: {
        threadId: input.providerSessionId.trim(),
        ...shared,
      },
    };
  }

  return {
    method: "thread/start",
    params: {
      ...shared,
      ephemeral: false,
      experimentalRawEvents: false,
    },
  };
}

function buildUserInput(parts: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return parts.map((part) => {
    if (
      part.type === "image" &&
      typeof part.base64Data === "string" &&
      typeof part.mediaType === "string"
    ) {
      return {
        type: "image",
        image_url: `data:${part.mediaType};base64,${part.base64Data}`,
      };
    }
    return {
      text: typeof part.text === "string" ? part.text : "",
      text_elements: [],
      type: "text",
    };
  });
}

function buildTurnStartParams(
  input: CodexWorkerInput,
  providerThreadId: string,
  inputParts: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    ...(input.modelReasoningEffort ? { effort: input.modelReasoningEffort } : {}),
    input: buildUserInput(inputParts),
    threadId: providerThreadId,
  };
}

function isJsonRpcRequest(message: unknown): message is CodexJsonRpcRequest {
  return isRecord(message) && "method" in message && "id" in message;
}

function isJsonRpcResponse(message: unknown): message is CodexJsonRpcResponse {
  return (
    isRecord(message) &&
    "id" in message &&
    ("result" in message || "error" in message) &&
    !("method" in message)
  );
}

function isJsonRpcNotification(message: unknown): message is { method: string; params?: unknown } {
  return isRecord(message) && typeof message.method === "string" && !("id" in message);
}

function resolveLifecycleTurnId(
  providerTurnId: string | null | undefined,
  currentLifecycleTurnId: string | null,
  providerTurnToLifecycleTurnId: Map<string, string>,
): string | null {
  if (providerTurnId && providerTurnToLifecycleTurnId.has(providerTurnId)) {
    return providerTurnToLifecycleTurnId.get(providerTurnId) ?? null;
  }

  return currentLifecycleTurnId;
}

export function createApprovalId(
  method: string,
  requestId: number | string,
  params: Record<string, unknown>,
): string {
  if (method === "item/commandExecution/requestApproval") {
    const approvalId = readString(params, "approvalId");
    if (approvalId) {
      return approvalId;
    }
  }

  if (method === "mcpServer/elicitation/request") {
    const elicitationId = readString(params, "elicitationId");
    if (elicitationId) {
      return elicitationId;
    }
  }

  const itemId = readString(params, "itemId");
  return itemId ? `codex:${method}:${itemId}` : `codex:${String(requestId)}`;
}

function inferFileChangeApprovalKind(item: Record<string, unknown> | undefined): AgentApprovalKind {
  const changes = item && Array.isArray(item.changes) ? item.changes : [];
  const normalizedKinds = changes.flatMap((change) => {
    if (!isRecord(change)) {
      return [];
    }
    const kind = readString(change, "kind");
    return kind ? [kind] : [];
  });

  if (normalizedKinds.length > 0 && normalizedKinds.every((kind) => kind === "delete")) {
    return "file_delete";
  }

  return "file_write";
}

function inferPermissionsApprovalKind(params: Record<string, unknown>): AgentApprovalKind {
  const permissions = isRecord(params.permissions) ? params.permissions : null;
  if (permissions && permissions.network !== null && permissions.network !== undefined) {
    return "network";
  }
  return "file_write";
}

function buildCommandApprovalMessage(params: Record<string, unknown>): string {
  const networkContext = isRecord(params.networkApprovalContext)
    ? params.networkApprovalContext
    : null;
  if (networkContext) {
    const host = readString(networkContext, "host");
    const protocol = readString(networkContext, "protocol");
    if (host && protocol) {
      return `Codex wants network access to ${host} over ${protocol}.`;
    }
    if (host) {
      return `Codex wants network access to ${host}.`;
    }
  }

  const reason = readString(params, "reason");
  if (reason) {
    return reason;
  }

  const command = readString(params, "command");
  if (command) {
    return `Codex wants to run: ${command}`;
  }

  return "Codex needs approval before running a command.";
}

function buildFileChangeApprovalMessage(
  params: Record<string, unknown>,
  item: Record<string, unknown> | undefined,
): string {
  const reason = readString(params, "reason");
  if (reason) {
    return reason;
  }

  const changes = item && Array.isArray(item.changes) ? item.changes : [];
  if (changes.length > 0) {
    const fileCount = changes.length;
    return `Codex wants to apply changes to ${fileCount} file${fileCount === 1 ? "" : "s"}.`;
  }

  return "Codex wants to apply file changes.";
}

function buildPermissionsApprovalMessage(params: Record<string, unknown>): string {
  const reason = readOptionalString(params, "reason");
  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }

  const permissions = isRecord(params.permissions) ? params.permissions : null;
  if (permissions?.network) {
    return "Codex wants additional network access.";
  }
  return "Codex wants additional filesystem permissions.";
}

function buildQuestionMessage(params: Record<string, unknown>): string {
  const questions = Array.isArray(params.questions) ? params.questions : [];
  for (const question of questions) {
    if (!isRecord(question)) {
      continue;
    }
    const prompt = readString(question, "question");
    if (prompt) {
      return prompt;
    }
  }

  return "Codex needs more input before it can continue.";
}

function buildToolUserInputMetadata(params: Record<string, unknown>): Record<string, unknown> {
  const questions = Array.isArray(params.questions)
    ? params.questions.flatMap((question) => {
        if (!isRecord(question)) {
          return [];
        }
        return [
          {
            header:
              readString(question, "header") ?? readString(question, "question") ?? "Question",
            id: readString(question, "id"),
            isOther: readBoolean(question, "isOther") ?? false,
            isSecret: readBoolean(question, "isSecret") ?? false,
            multiSelect: false,
            options: Array.isArray(question.options)
              ? question.options.flatMap((option) => {
                  if (!isRecord(option)) {
                    return [];
                  }
                  const label = readString(option, "label");
                  if (!label) {
                    return [];
                  }
                  return [
                    {
                      description: readString(option, "description") ?? "",
                      label,
                    },
                  ];
                })
              : [],
            question: readString(question, "question") ?? "",
          },
        ];
      })
    : [];

  return {
    itemId: readString(params, "itemId") ?? null,
    method: "item/tool/requestUserInput",
    questions,
  };
}

export function buildMcpElicitationMetadata(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    _meta: params._meta ?? null,
    elicitationId: readString(params, "elicitationId") ?? null,
    method: "mcpServer/elicitation/request",
    mode: readString(params, "mode") ?? "form",
    requestedSchema: params.requestedSchema ?? null,
    serverName: readString(params, "serverName") ?? null,
    url: readString(params, "url") ?? null,
  };
}

function createCodexApprovalRequest(
  lifecycleTurnId: string,
  method: string,
  params: Record<string, unknown>,
  item: Record<string, unknown> | undefined,
  requestId: number | string,
): AgentWorkerApprovalRequestPayload {
  switch (method) {
    case "item/commandExecution/requestApproval":
      return {
        id: createApprovalId(method, requestId, params),
        kind: isRecord(params.networkApprovalContext) ? "network" : "shell",
        message: buildCommandApprovalMessage(params),
        metadata: {
          additionalPermissions: params.additionalPermissions ?? null,
          availableDecisions: params.availableDecisions ?? null,
          command: readString(params, "command") ?? null,
          commandActions: params.commandActions ?? null,
          cwd: readString(params, "cwd") ?? null,
          itemId: readString(params, "itemId") ?? null,
          method,
          networkApprovalContext: params.networkApprovalContext ?? null,
          proposedExecpolicyAmendment: params.proposedExecpolicyAmendment ?? null,
          proposedNetworkPolicyAmendments: params.proposedNetworkPolicyAmendments ?? null,
          reason: readOptionalString(params, "reason") ?? null,
          skillMetadata: params.skillMetadata ?? null,
        },
        scopeKey: `codex:${lifecycleTurnId}:${readString(params, "itemId") ?? String(requestId)}`,
        status: "pending",
      };
    case "item/fileChange/requestApproval":
      return {
        id: createApprovalId(method, requestId, params),
        kind: inferFileChangeApprovalKind(item),
        message: buildFileChangeApprovalMessage(params, item),
        metadata: {
          changes: item?.changes ?? null,
          grantRoot: readOptionalString(params, "grantRoot") ?? null,
          itemId: readString(params, "itemId") ?? null,
          method,
          reason: readOptionalString(params, "reason") ?? null,
        },
        scopeKey: `codex:${lifecycleTurnId}:${readString(params, "itemId") ?? String(requestId)}`,
        status: "pending",
      };
    case "item/permissions/requestApproval":
      return {
        id: createApprovalId(method, requestId, params),
        kind: inferPermissionsApprovalKind(params),
        message: buildPermissionsApprovalMessage(params),
        metadata: {
          itemId: readString(params, "itemId") ?? null,
          method,
          permissions: params.permissions ?? null,
          reason: readOptionalString(params, "reason") ?? null,
        },
        scopeKey: `codex:${lifecycleTurnId}:${readString(params, "itemId") ?? String(requestId)}`,
        status: "pending",
      };
    case "item/tool/requestUserInput":
      return {
        id: createApprovalId(method, requestId, params),
        kind: "question",
        message: buildQuestionMessage(params),
        metadata: buildToolUserInputMetadata(params),
        scopeKey: `codex:${lifecycleTurnId}:${readString(params, "itemId") ?? String(requestId)}`,
        status: "pending",
      };
    case "mcpServer/elicitation/request":
      return {
        id: createApprovalId(method, requestId, params),
        kind: "question",
        message: readString(params, "message") ?? "Codex needs more input before it can continue.",
        metadata: buildMcpElicitationMetadata(params),
        scopeKey: `codex:${lifecycleTurnId}:${readString(params, "serverName") ?? String(requestId)}`,
        status: "pending",
      };
    default:
      return {
        id: createApprovalId(method, requestId, params),
        kind: "tool",
        message: "Codex requested host intervention.",
        metadata: {
          itemId: readString(params, "itemId") ?? null,
          method,
          params,
        },
        scopeKey: `codex:${lifecycleTurnId}:${String(requestId)}`,
        status: "pending",
      };
  }
}

function buildCommandExecutionResponse(decision: AgentApprovalDecision): Record<string, unknown> {
  switch (decision) {
    case "approve_session":
      return { decision: "acceptForSession" };
    case "reject":
      return { decision: "decline" };
    case "approve_once":
    default:
      return { decision: "accept" };
  }
}

function buildFileChangeResponse(decision: AgentApprovalDecision): Record<string, unknown> {
  switch (decision) {
    case "approve_session":
      return { decision: "acceptForSession" };
    case "reject":
      return { decision: "decline" };
    case "approve_once":
    default:
      return { decision: "accept" };
  }
}

function buildPermissionsResponse(
  decision: AgentApprovalDecision,
  pending: PendingCodexApproval,
  response: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const permissions =
    response && isRecord(response.permissions)
      ? response.permissions
      : pending.params.permissions && isRecord(pending.params.permissions)
        ? pending.params.permissions
        : {};

  return {
    permissions: decision === "reject" ? {} : permissions,
    scope: decision === "approve_session" ? "session" : "turn",
  };
}

function buildToolUserInputResponse(
  response: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const sourceAnswers = response && isRecord(response.answers) ? response.answers : {};
  const answers = Object.fromEntries(
    Object.entries(sourceAnswers).flatMap(([questionId, value]) => {
      if (typeof value === "string") {
        return [[questionId, { answers: [value] }]];
      }
      if (Array.isArray(value)) {
        const normalized = value.filter((item): item is string => typeof item === "string");
        return [[questionId, { answers: normalized }]];
      }
      if (isRecord(value) && Array.isArray(value.answers)) {
        const normalized = value.answers.filter((item): item is string => typeof item === "string");
        return [[questionId, { answers: normalized }]];
      }
      return [];
    }),
  );

  return { answers };
}

function buildMcpElicitationResponse(
  decision: AgentApprovalDecision,
  params: Record<string, unknown>,
  response: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (decision === "reject") {
    return {
      _meta: null,
      action: "decline",
      content: null,
    };
  }

  const responseRecord = response && isRecord(response) ? response : null;
  const { _meta, ...contentRecord } = responseRecord ?? {};

  if (readString(params, "mode") === "url") {
    const url =
      typeof contentRecord.url === "string" ? contentRecord.url : readString(params, "url");
    return {
      _meta: _meta ?? null,
      action: "accept",
      content: url ? { ...contentRecord, url } : contentRecord,
    };
  }

  return {
    _meta: _meta ?? null,
    action: "accept",
    content: responseRecord ? contentRecord : null,
  };
}

export function buildCodexApprovalResponse(
  pending: Pick<PendingCodexApproval, "method" | "params">,
  decision: AgentApprovalDecision,
  response?: Record<string, unknown> | null,
): Record<string, unknown> {
  switch (pending.method) {
    case "item/commandExecution/requestApproval":
      return buildCommandExecutionResponse(decision);
    case "item/fileChange/requestApproval":
      return buildFileChangeResponse(decision);
    case "item/permissions/requestApproval":
      return buildPermissionsResponse(decision, pending as PendingCodexApproval, response);
    case "item/tool/requestUserInput":
      return buildToolUserInputResponse(response);
    case "mcpServer/elicitation/request":
      return buildMcpElicitationResponse(decision, pending.params, response);
    default:
      return {};
  }
}

class CodexAppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private initialized = false;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number | string, PendingRpcRequest>();

  constructor(
    workspacePath: string,
    private readonly onLineMessage: (message: unknown) => void,
  ) {
    this.child = spawn(
      process.execPath,
      [
        resolveCodexCliPath(),
        "app-server",
        "--listen",
        "stdio://",
        "--session-source",
        "lifecycle",
      ],
      {
        cwd: workspacePath,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  }

  get stdin() {
    return this.child.stdin;
  }

  get stdout() {
    return this.child.stdout;
  }

  get stderr() {
    return this.child.stderr;
  }

  on(event: "close" | "error", listener: (...args: any[]) => void): void {
    this.child.on(event, listener);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.request("initialize", {
      capabilities: {
        experimentalApi: true,
      },
      clientInfo: {
        name: "lifecycle",
        title: "Lifecycle",
        version: "0.0.0",
      },
    });
    this.notify("initialized");
    this.initialized = true;
  }

  handleStdoutLine(line: string): void {
    const message = JSON.parse(line) as unknown;
    if (isJsonRpcResponse(message)) {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        return;
      }
      this.pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            message.error.message ?? `Codex app-server request ${String(message.id)} failed.`,
          ),
        );
        return;
      }
      pending.resolve(message.result);
      return;
    }

    this.onLineMessage(message);
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextRequestId++;
    const request: CodexJsonRpcRequest = {
      id,
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params }),
    };
    this.stdin.write(`${JSON.stringify(request)}\n`);
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { reject, resolve });
    });
  }

  notify(method: string, params?: unknown): void {
    const payload = {
      jsonrpc: "2.0" as const,
      method,
      ...(params === undefined ? {} : { params }),
    };
    this.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  respond(id: number | string, result: unknown): void {
    const payload = {
      id,
      jsonrpc: "2.0" as const,
      result,
    };
    this.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  respondError(id: number | string, message: string): void {
    const payload = {
      error: {
        code: -32601,
        message,
      },
      id,
      jsonrpc: "2.0" as const,
    };
    this.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  failPendingRequests(reason: string): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }
}

export async function runCodexWorker(input: CodexWorkerInput): Promise<number> {
  process.chdir(input.workspacePath);

  const pendingApprovals = new Map<string, PendingCodexApproval>();
  const providerTurnToLifecycleTurnId = new Map<string, string>();
  const lifecycleTurnToProviderTurnId = new Map<string, string>();
  const itemById = new Map<string, Record<string, unknown>>();
  const itemStartedAt = new Map<string, number>();
  const itemIdsByLifecycleTurnId = new Map<string, Set<string>>();
  const fileChangeItemIdsByTurnId = new Map<string, Set<string>>();
  const turnDiffItemIdByTurnId = new Map<string, string>();
  const turnUsage = new Map<
    string,
    { cacheReadTokens?: number; inputTokens: number; outputTokens: number }
  >();
  const pendingTurnCompletions = new Map<string, () => void>();

  let currentLifecycleTurnId: string | null = null;
  let currentProviderThreadId: string | null = null;
  let currentProviderTurnId: string | null = null;
  let pendingInterrupt = false;

  const client = new CodexAppServerClient(input.workspacePath, handleAppServerMessage);

  function bindProviderThread(threadId: string | null | undefined): void {
    if (!threadId || currentProviderThreadId === threadId) {
      return;
    }
    currentProviderThreadId = threadId;
    emitWorkerEvent({
      kind: "worker.ready",
      providerSessionId: threadId,
    });
  }

  function bindProviderTurn(
    providerTurnId: string | null | undefined,
    lifecycleTurnId: string | null,
  ): void {
    if (!providerTurnId || !lifecycleTurnId) {
      return;
    }

    currentProviderTurnId = providerTurnId;
    providerTurnToLifecycleTurnId.set(providerTurnId, lifecycleTurnId);
    lifecycleTurnToProviderTurnId.set(lifecycleTurnId, providerTurnId);
  }

  function trackTurnItem(lifecycleTurnId: string, itemId: string, isFileChange = false): void {
    const turnItemIds = itemIdsByLifecycleTurnId.get(lifecycleTurnId) ?? new Set<string>();
    turnItemIds.add(itemId);
    itemIdsByLifecycleTurnId.set(lifecycleTurnId, turnItemIds);

    if (!isFileChange) {
      return;
    }

    const fileChangeItemIds = fileChangeItemIdsByTurnId.get(lifecycleTurnId) ?? new Set<string>();
    fileChangeItemIds.add(itemId);
    fileChangeItemIdsByTurnId.set(lifecycleTurnId, fileChangeItemIds);
  }

  function clearTurnState(lifecycleTurnId: string): void {
    const providerTurnId = lifecycleTurnToProviderTurnId.get(lifecycleTurnId);
    if (providerTurnId) {
      lifecycleTurnToProviderTurnId.delete(lifecycleTurnId);
      providerTurnToLifecycleTurnId.delete(providerTurnId);
      turnUsage.delete(providerTurnId);
    }

    const itemIds = itemIdsByLifecycleTurnId.get(lifecycleTurnId);
    if (itemIds) {
      for (const itemId of itemIds) {
        itemById.delete(itemId);
        itemStartedAt.delete(itemId);
      }
      itemIdsByLifecycleTurnId.delete(lifecycleTurnId);
    }

    fileChangeItemIdsByTurnId.delete(lifecycleTurnId);
    turnDiffItemIdByTurnId.delete(lifecycleTurnId);
  }

  function completeLifecycleTurn(lifecycleTurnId: string): void {
    clearTurnState(lifecycleTurnId);
    const resolve = pendingTurnCompletions.get(lifecycleTurnId);
    pendingTurnCompletions.delete(lifecycleTurnId);
    if (resolve) {
      resolve();
    }
    if (currentLifecycleTurnId === lifecycleTurnId) {
      currentLifecycleTurnId = null;
      currentProviderTurnId = null;
      pendingInterrupt = false;
    }
  }

  function failLifecycleTurn(lifecycleTurnId: string, error: string): void {
    emitWorkerEvent({
      error,
      kind: "agent.turn.failed",
      turnId: lifecycleTurnId,
    });
    completeLifecycleTurn(lifecycleTurnId);
  }

  function handleThreadNotification(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case "thread/started": {
        const thread = isRecord(params.thread) ? params.thread : null;
        bindProviderThread(thread ? readString(thread, "id") : null);
        return;
      }
      case "thread/tokenUsage/updated": {
        const providerTurnId = readString(params, "turnId");
        const tokenUsage = isRecord(params.tokenUsage) ? params.tokenUsage : null;
        const last = tokenUsage && isRecord(tokenUsage.last) ? tokenUsage.last : null;
        if (!providerTurnId || !last) {
          return;
        }
        turnUsage.set(providerTurnId, {
          ...(typeof readNumber(last, "cachedInputTokens") === "number"
            ? { cacheReadTokens: readNumber(last, "cachedInputTokens") ?? 0 }
            : {}),
          inputTokens: readNumber(last, "inputTokens") ?? 0,
          outputTokens: readNumber(last, "outputTokens") ?? 0,
        });
        return;
      }
      default:
        return;
    }
  }

  function emitDeltaEvent(
    kind: "agent.message.delta" | "agent.thinking.delta",
    providerTurnId: string | undefined,
    itemId: string | undefined,
    text: string | undefined,
    blockId: string,
  ): void {
    const lifecycleTurnId = resolveLifecycleTurnId(
      providerTurnId ?? null,
      currentLifecycleTurnId,
      providerTurnToLifecycleTurnId,
    );
    if (!lifecycleTurnId || !itemId || !text) {
      return;
    }

    emitWorkerEvent({
      blockId,
      kind,
      text,
      turnId: lifecycleTurnId,
    });
  }

  function handleItemNotification(
    kind: "agent.item.completed" | "agent.item.started",
    params: Record<string, unknown>,
  ): void {
    const rawItem = isRecord(params.item) ? params.item : null;
    const providerTurnId = readString(params, "turnId");
    const lifecycleTurnId = resolveLifecycleTurnId(
      providerTurnId ?? null,
      currentLifecycleTurnId,
      providerTurnToLifecycleTurnId,
    );
    if (!rawItem || !lifecycleTurnId) {
      return;
    }

    const itemId = readString(rawItem, "id");
    const item = itemId ? mergeCodexItemSnapshot(itemById.get(itemId), rawItem) : rawItem;
    if (itemId) {
      itemById.set(itemId, item);
      if (kind === "agent.item.started") {
        itemStartedAt.set(itemId, Date.now());
      }
      trackTurnItem(lifecycleTurnId, itemId, readString(item, "type") === "fileChange");
    }

    const itemType = readString(item, "type");
    if (itemType === "agentMessage" || itemType === "reasoning") {
      return;
    }

    const workerItem = mapCodexThreadItemToWorkerItem(item);
    if (!workerItem) {
      return;
    }

    emitWorkerEvent({
      item: workerItem,
      kind,
      turnId: lifecycleTurnId,
    });
  }

  function handleCommandExecutionOutputDelta(params: Record<string, unknown>): void {
    const providerTurnId = readString(params, "turnId");
    const itemId = readString(params, "itemId");
    const lifecycleTurnId = resolveLifecycleTurnId(
      providerTurnId ?? null,
      currentLifecycleTurnId,
      providerTurnToLifecycleTurnId,
    );
    const delta = readString(params, "delta");
    if (!lifecycleTurnId || !itemId || !delta) {
      return;
    }

    const item = itemById.get(itemId);
    if (!item || readString(item, "type") !== "commandExecution") {
      return;
    }

    const nextItem = appendCodexCommandExecutionOutputDelta(item, delta);
    itemById.set(itemId, nextItem);

    const workerItem = mapCodexThreadItemToWorkerItem(nextItem);
    if (!workerItem || workerItem.type !== "command_execution") {
      return;
    }

    emitWorkerEvent({
      item: workerItem,
      kind: "agent.item.updated",
      turnId: lifecycleTurnId,
    });
  }

  function handleFileChangeOutputDelta(params: Record<string, unknown>): void {
    const providerTurnId = readString(params, "turnId");
    const itemId = readString(params, "itemId");
    const lifecycleTurnId = resolveLifecycleTurnId(
      providerTurnId ?? null,
      currentLifecycleTurnId,
      providerTurnToLifecycleTurnId,
    );
    const delta = readString(params, "delta");
    if (!lifecycleTurnId || !itemId || !delta) {
      return;
    }

    const item = itemById.get(itemId);
    if (!item || readString(item, "type") !== "fileChange") {
      return;
    }

    trackTurnItem(lifecycleTurnId, itemId, true);
    const nextItem = appendCodexFileChangeOutputDelta(item, delta);
    itemById.set(itemId, nextItem);

    const workerItem = mapCodexThreadItemToWorkerItem(nextItem);
    if (!workerItem || workerItem.type !== "file_change") {
      return;
    }

    emitWorkerEvent({
      item: workerItem,
      kind: "agent.item.updated",
      turnId: lifecycleTurnId,
    });
  }

  function buildAggregateTurnDiffItem(
    lifecycleTurnId: string,
    diff: string,
  ): Record<string, unknown> {
    const fileChangeItems = [...(fileChangeItemIdsByTurnId.get(lifecycleTurnId) ?? new Set())]
      .map((itemId) => itemById.get(itemId))
      .filter((item): item is Record<string, unknown> => item !== undefined);
    const aggregateItemId =
      turnDiffItemIdByTurnId.get(lifecycleTurnId) ?? `${lifecycleTurnId}:turn-diff`;
    const nextItem = mergeCodexItemSnapshot(
      itemById.get(aggregateItemId),
      buildCodexTurnDiffItem(lifecycleTurnId, diff, fileChangeItems),
    );
    turnDiffItemIdByTurnId.set(lifecycleTurnId, aggregateItemId);
    itemById.set(aggregateItemId, nextItem);
    trackTurnItem(lifecycleTurnId, aggregateItemId, true);
    return nextItem;
  }

  function handleTurnDiffUpdated(params: Record<string, unknown>): void {
    const providerTurnId = readString(params, "turnId");
    const lifecycleTurnId = resolveLifecycleTurnId(
      providerTurnId ?? null,
      currentLifecycleTurnId,
      providerTurnToLifecycleTurnId,
    );
    const diff = readString(params, "diff");
    if (!lifecycleTurnId || !diff) {
      return;
    }

    const fileChangeItemIds = [...(fileChangeItemIdsByTurnId.get(lifecycleTurnId) ?? new Set())];
    const nextItem =
      fileChangeItemIds.length === 1
        ? (() => {
            const itemId = fileChangeItemIds[0]!;
            const item = itemById.get(itemId);
            if (!item || readString(item, "type") !== "fileChange") {
              return null;
            }
            const updatedItem = { ...item, diff };
            itemById.set(itemId, updatedItem);
            return updatedItem;
          })()
        : buildAggregateTurnDiffItem(lifecycleTurnId, diff);
    if (!nextItem) {
      return;
    }

    const workerItem = mapCodexThreadItemToWorkerItem(nextItem);
    if (!workerItem || workerItem.type !== "file_change") {
      return;
    }

    emitWorkerEvent({
      item: workerItem,
      kind: "agent.item.updated",
      turnId: lifecycleTurnId,
    });
  }

  function handleTurnCompleted(params: Record<string, unknown>): void {
    const turn = isRecord(params.turn) ? params.turn : null;
    const providerTurnId = turn ? readString(turn, "id") : null;
    const lifecycleTurnId = resolveLifecycleTurnId(
      providerTurnId,
      currentLifecycleTurnId,
      providerTurnToLifecycleTurnId,
    );
    if (!turn || !providerTurnId || !lifecycleTurnId) {
      return;
    }

    const status = readString(turn, "status");
    if (status === "completed") {
      emitWorkerEvent({
        kind: "agent.turn.completed",
        turnId: lifecycleTurnId,
        ...(turnUsage.has(providerTurnId) ? { usage: turnUsage.get(providerTurnId) } : {}),
      });
      completeLifecycleTurn(lifecycleTurnId);

      // Fire-and-forget title generation after the first successful turn.
      if (!titleGenerated && firstTurnText) {
        titleGenerated = true;
        void generateSessionTitle(firstTurnText).then((title) => {
          if (title) {
            emitWorkerEvent({ kind: "worker.title_generated", title });
          }
        });
      }
      return;
    }

    const errorRecord = isRecord(turn.error) ? turn.error : null;
    failLifecycleTurn(
      lifecycleTurnId,
      readString(errorRecord ?? {}, "message") ?? `Codex turn ${status ?? "failed"}.`,
    );
  }

  function handleServerRequest(message: CodexJsonRpcRequest): void {
    const params = isRecord(message.params) ? message.params : {};
    const providerTurnId = readString(params, "turnId");
    const lifecycleTurnId = resolveLifecycleTurnId(
      providerTurnId ?? null,
      currentLifecycleTurnId,
      providerTurnToLifecycleTurnId,
    );
    if (!lifecycleTurnId) {
      client.respondError(message.id, `No Lifecycle turn is bound for ${message.method}.`);
      return;
    }

    if (
      message.method !== "item/commandExecution/requestApproval" &&
      message.method !== "item/fileChange/requestApproval" &&
      message.method !== "item/permissions/requestApproval" &&
      message.method !== "item/tool/requestUserInput" &&
      message.method !== "mcpServer/elicitation/request"
    ) {
      client.respondError(
        message.id,
        `Lifecycle does not support Codex server request ${message.method}.`,
      );
      return;
    }

    const itemId = readString(params, "itemId");
    const item = itemId ? itemById.get(itemId) : undefined;
    const approval = createCodexApprovalRequest(
      lifecycleTurnId,
      message.method,
      params,
      item,
      message.id,
    );
    pendingApprovals.set(approval.id, {
      approval,
      lifecycleTurnId,
      method: message.method,
      params,
      requestId: message.id,
    });
    emitWorkerEvent({
      approval,
      kind: "agent.approval.requested",
      turnId: lifecycleTurnId,
    });
  }

  function handleAppServerMessage(message: unknown): void {
    if (isJsonRpcRequest(message)) {
      const params = isRecord(message.params) ? message.params : {};
      const lifecycleTurnId = resolveLifecycleTurnId(
        readString(params, "turnId") ?? null,
        currentLifecycleTurnId,
        providerTurnToLifecycleTurnId,
      );
      emitRawProviderEvent(`codex.request.${message.method}`, message, lifecycleTurnId);
      handleServerRequest(message);
      return;
    }

    if (!isJsonRpcNotification(message)) {
      return;
    }

    const params = isRecord(message.params) ? message.params : {};
    const lifecycleTurnId = resolveLifecycleTurnId(
      readString(params, "turnId") ?? null,
      currentLifecycleTurnId,
      providerTurnToLifecycleTurnId,
    );
    emitRawProviderEvent(`codex.notification.${message.method}`, message, lifecycleTurnId);
    switch (message.method) {
      case "thread/started":
      case "thread/tokenUsage/updated":
        handleThreadNotification(message.method, params);
        return;
      case "turn/started": {
        const turn = isRecord(params.turn) ? params.turn : null;
        bindProviderTurn(turn ? readString(turn, "id") : null, currentLifecycleTurnId);
        if (pendingInterrupt && currentProviderTurnId) {
          pendingInterrupt = false;
          void client
            .request("turn/interrupt", {
              threadId: currentProviderThreadId,
              turnId: currentProviderTurnId,
            })
            .catch(() => undefined);
        }
        return;
      }
      case "turn/completed":
        handleTurnCompleted(params);
        return;
      case "item/started":
        handleItemNotification("agent.item.started", params);
        return;
      case "item/completed":
        handleItemNotification("agent.item.completed", params);
        return;
      case "item/commandExecution/outputDelta":
        handleCommandExecutionOutputDelta(params);
        return;
      case "item/fileChange/outputDelta":
        handleFileChangeOutputDelta(params);
        return;
      case "turn/diff/updated":
        handleTurnDiffUpdated(params);
        return;
      case "item/agentMessage/delta": {
        const itemId = readString(params, "itemId") ?? "";
        emitDeltaEvent(
          "agent.message.delta",
          readString(params, "turnId"),
          itemId || undefined,
          readString(params, "delta"),
          `text:${itemId}`,
        );
        return;
      }
      case "item/reasoning/textDelta": {
        const itemId = readString(params, "itemId") ?? "";
        const contentIndex = readNumber(params, "contentIndex") ?? 0;
        emitDeltaEvent(
          "agent.thinking.delta",
          readString(params, "turnId"),
          itemId || undefined,
          readString(params, "delta"),
          `thinking:${itemId}:${contentIndex}`,
        );
        return;
      }
      case "item/mcpToolCall/progress": {
        const providerTurnId = readString(params, "turnId");
        const itemId = readString(params, "itemId");
        const lifecycleTurnId = resolveLifecycleTurnId(
          providerTurnId ?? null,
          currentLifecycleTurnId,
          providerTurnToLifecycleTurnId,
        );
        const item = itemId ? itemById.get(itemId) : null;
        if (!lifecycleTurnId || !itemId || !item) {
          return;
        }
        const startedAt = itemStartedAt.get(itemId) ?? Date.now();
        emitWorkerEvent({
          elapsedTimeSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
          kind: "agent.tool_progress",
          toolName: `${readString(item, "server") ?? "mcp"}/${readString(item, "tool") ?? "tool"}`,
          toolUseId: itemId,
          turnId: lifecycleTurnId,
        });
        return;
      }
      case "error": {
        const lifecycleTurnId = currentLifecycleTurnId;
        const errorMessage = readString(params, "message") ?? "Codex app-server error.";
        if (lifecycleTurnId) {
          failLifecycleTurn(lifecycleTurnId, errorMessage);
        }
        return;
      }
      default:
        return;
    }
  }

  const stdoutReader = createInterface({ input: client.stdout });
  stdoutReader.on("line", (line) => {
    try {
      client.handleStdoutLine(line);
    } catch (error) {
      console.error("[codex-app-server] failed to parse line:", line, error);
    }
  });

  client.stderr.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line.length > 0) {
      console.error("[codex-app-server]", line);
    }
  });

  client.on("error", (error) => {
    client.failPendingRequests(
      error instanceof Error ? error.message : "Codex app-server process error.",
    );
    if (currentLifecycleTurnId) {
      failLifecycleTurn(
        currentLifecycleTurnId,
        error instanceof Error ? error.message : "Codex app-server process error.",
      );
    }
  });

  client.on("close", (code, signal) => {
    const reason = `Codex app-server exited (code=${code ?? "null"} signal=${signal ?? "null"}).`;
    client.failPendingRequests(reason);
    if (currentLifecycleTurnId) {
      failLifecycleTurn(currentLifecycleTurnId, reason);
    }
  });

  await client.initialize();
  const bootstrap = createCodexThreadBootstrapRequest(input);
  const bootstrapResult = await client.request(bootstrap.method, bootstrap.params);
  const threadRecord =
    isRecord(bootstrapResult) && isRecord(bootstrapResult.thread) ? bootstrapResult.thread : null;
  bindProviderThread(threadRecord ? readString(threadRecord, "id") : null);

  let turnQueue = Promise.resolve();
  let firstTurnText: string | null = null;
  let titleGenerated = false;

  async function processTurn(
    command: Extract<AgentWorkerCommand, { kind: "worker.send_turn" }>,
  ): Promise<void> {
    const threadId = currentProviderThreadId;
    if (!threadId) {
      emitWorkerEvent({
        error: "Codex app-server did not return a thread id.",
        kind: "agent.turn.failed",
        turnId: command.turnId,
      });
      return;
    }

    currentLifecycleTurnId = command.turnId;
    currentProviderTurnId = null;
    pendingInterrupt = false;

    // Capture the first turn's text for title generation.
    if (!titleGenerated && firstTurnText === null) {
      const text = extractTextFromInput(
        Array.isArray(command.input)
          ? (command.input as AgentWorkerInputPart[])
          : [{ type: "text" as const, text: command.input as string }],
      );
      firstTurnText = text.length > 0 ? text : null;
    }

    const completion = new Promise<void>((resolve) => {
      pendingTurnCompletions.set(command.turnId, resolve);
    });

    try {
      const response = await client.request(
        "turn/start",
        buildTurnStartParams(
          input,
          threadId,
          Array.isArray(command.input)
            ? (command.input as Array<Record<string, unknown>>)
            : [{ type: "text", text: command.input as string }],
        ),
      );
      const turnRecord = isRecord(response) && isRecord(response.turn) ? response.turn : null;
      bindProviderTurn(turnRecord ? readString(turnRecord, "id") : null, command.turnId);
      if (pendingInterrupt && currentProviderTurnId) {
        pendingInterrupt = false;
        await client.request("turn/interrupt", {
          threadId,
          turnId: currentProviderTurnId,
        });
      }
      await completion;
    } catch (error) {
      failLifecycleTurn(
        command.turnId,
        error instanceof Error ? error.message : "Codex turn failed.",
      );
    }
  }

  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    buffer += decoder.decode(result.value, { stream: true });

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length === 0) {
        continue;
      }

      const command = normalizeCommand(line);
      switch (command.kind) {
        case "worker.send_turn":
          turnQueue = turnQueue.catch(() => undefined).then(() => processTurn(command));
          break;
        case "worker.cancel_turn":
          if (currentProviderThreadId && currentProviderTurnId) {
            void client
              .request("turn/interrupt", {
                threadId: currentProviderThreadId,
                turnId: currentProviderTurnId,
              })
              .catch((error) => {
                if (currentLifecycleTurnId) {
                  failLifecycleTurn(
                    currentLifecycleTurnId,
                    error instanceof Error ? error.message : "Failed to interrupt Codex turn.",
                  );
                }
              });
          } else {
            pendingInterrupt = true;
          }
          break;
        case "worker.resolve_approval": {
          const pending = pendingApprovals.get(command.approvalId);
          if (!pending) {
            if (currentLifecycleTurnId) {
              failLifecycleTurn(
                currentLifecycleTurnId,
                `Unknown Codex approval ${command.approvalId}.`,
              );
            }
            break;
          }

          pendingApprovals.delete(command.approvalId);
          try {
            client.respond(
              pending.requestId,
              buildCodexApprovalResponse(pending, command.decision, command.response ?? null),
            );
            emitWorkerEvent({
              kind: "agent.approval.resolved",
              resolution: {
                approvalId: pending.approval.id,
                decision: command.decision,
                response: command.response ?? null,
              },
              turnId: pending.lifecycleTurnId,
            });
          } catch (error) {
            failLifecycleTurn(
              pending.lifecycleTurnId,
              error instanceof Error ? error.message : "Failed to resolve Codex approval.",
            );
          }
          break;
        }
      }
    }
  }

  await turnQueue;
  return 0;
}
