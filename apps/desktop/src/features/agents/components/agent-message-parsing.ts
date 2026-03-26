import type {
  AgentApprovalDecision,
  AgentApprovalKind,
  AgentApprovalStatus,
  AgentArtifactType,
  AgentImageMediaType,
  AgentMessagePart,
  AgentToolCallStatus,
} from "@lifecycle/agents";
import { parseAgentMessagePartData, type AgentMessagePartRecord } from "@lifecycle/contracts";
import {
  claudeEffortOptions,
  codexReasoningEffortOptions,
} from "@/features/settings/state/harness-settings";

export interface ParsedMessage {
  id: string;
  role: string;
  parts: ParsedMessagePartEntry[];
  text: string;
  turnId: string | null;
}

export interface ParsedMessagePartEntry {
  id: string;
  part: AgentMessagePart;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function partRecordToPart(record: AgentMessagePartRecord): AgentMessagePart {
  const data = parseAgentMessagePartData(record.part_type, record.data) as Record<
    string,
    unknown
  > | null;
  const readString = (key: string): string | undefined => {
    const value = data?.[key];
    return typeof value === "string" ? value : undefined;
  };

  switch (record.part_type) {
    case "text":
      return { type: "text", text: record.text ?? "" };
    case "thinking":
      return { type: "thinking", text: record.text ?? "" };
    case "status":
      return { type: "status", text: record.text ?? "" };
    case "tool_call":
      return {
        type: "tool_call",
        toolCallId: readString("tool_call_id") ?? "",
        toolName: readString("tool_name") ?? "",
        inputJson: readString("input_json"),
        outputJson: readString("output_json"),
        status: readString("status") as AgentToolCallStatus | undefined,
        errorText: readString("error_text"),
      };
    case "tool_result":
      return {
        type: "tool_result",
        toolCallId: readString("tool_call_id") ?? "",
        outputJson: readString("output_json"),
        errorText: readString("error_text"),
      };
    case "image":
      return {
        type: "image",
        mediaType: (readString("media_type") ?? "image/png") as AgentImageMediaType,
        base64Data: readString("base64_data") ?? "",
      };
    case "attachment_ref":
      return { type: "attachment_ref", attachmentId: readString("attachment_id") ?? "" };
    case "approval_ref":
      return {
        type: "approval_ref",
        approvalId: readString("approval_id") ?? "",
        decision: readString("decision") as AgentApprovalDecision | undefined,
        kind: readString("kind") as AgentApprovalKind | undefined,
        message: readString("message"),
        metadata: (data?.metadata as Record<string, unknown> | undefined) ?? undefined,
        status: readString("status") as AgentApprovalStatus | undefined,
      };
    case "artifact_ref":
      return {
        type: "artifact_ref",
        artifactId: readString("artifact_id") ?? "",
        artifactType: readString("artifact_type") as AgentArtifactType | undefined,
        title: readString("title"),
        uri: readString("uri"),
      };
    default:
      return { type: "text", text: record.text ?? "" };
  }
}

export function createTurnId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-turn-${Date.now()}`;
}

export interface DropdownOption<T extends string = string> {
  id: T;
  label: string;
  description?: string;
}

const claudeEffortByValue = new Map(claudeEffortOptions.map((o) => [o.value, o] as const));
const codexReasoningByValue = new Map(
  codexReasoningEffortOptions.map((o) => [o.value, o] as const),
);

export function ensureSelectedOption<T extends string>(
  options: readonly DropdownOption<T>[],
  value: T,
): DropdownOption<T>[] {
  if (options.some((option) => option.id === value)) {
    return [...options];
  }

  return [{ id: value, label: value }, ...options];
}

export function buildReasoningOptions<T extends string>(
  provider: "claude" | "codex",
  reasoningEfforts: string[],
  selected: T,
): DropdownOption<T>[] {
  const sourceMap = provider === "claude" ? claudeEffortByValue : codexReasoningByValue;
  const ids = Array.from(new Set(["default", ...reasoningEfforts])) as T[];
  const options: DropdownOption<T>[] = ids.map((id) => {
    const source = (sourceMap as ReadonlyMap<string, { label: string; description: string }>).get(
      id,
    );
    return {
      id,
      label: source?.label ?? id,
      description: source?.description,
    };
  });

  return ensureSelectedOption(options, selected);
}
