export type AgentSessionProviderId = "claude" | "codex";

export type AgentRuntimeKind = "native" | "adapter";
export type AgentMessageRole = "user" | "assistant" | "system" | "tool";

export type AgentSessionStatus =
  | "starting"
  | "idle"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentSessionRecord {
  id: string;
  workspace_id: string;
  runtime_kind: AgentRuntimeKind;
  runtime_name: string | null;
  provider: AgentSessionProviderId;
  provider_session_id: string | null;
  title: string;
  status: AgentSessionStatus;
  created_by: string | null;
  forked_from_session_id: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface AgentMessageRecord {
  id: string;
  session_id: string;
  role: AgentMessageRole;
  text: string;
  turn_id: string | null;
  created_at: string;
}

/** Hydrated message with inline parts — the shape the UI consumes. */
export interface AgentMessageWithParts {
  id: string;
  session_id: string;
  role: AgentMessageRole;
  text: string;
  turn_id: string | null;
  parts: AgentMessagePartRecord[];
  created_at: string;
}

export type AgentMessagePartType =
  | "text"
  | "thinking"
  | "status"
  | "image"
  | "tool_call"
  | "tool_result"
  | "attachment_ref"
  | "approval_ref"
  | "artifact_ref";

export interface AgentToolCallPartData {
  tool_call_id: string;
  tool_name: string;
  input_json?: string | undefined;
  output_json?: string | null | undefined;
  status?: string | null | undefined;
  error_text?: string | null | undefined;
}

export interface AgentToolResultPartData {
  tool_call_id: string;
  output_json?: string | null | undefined;
  error_text?: string | null | undefined;
}

export interface AgentAttachmentRefPartData {
  attachment_id: string;
}

export interface AgentApprovalRefPartData {
  approval_id: string;
  decision?: string | null | undefined;
  kind?: string | null | undefined;
  message?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  status?: string | null | undefined;
}

export interface AgentArtifactRefPartData {
  artifact_id: string;
  artifact_type?: string | null | undefined;
  title?: string | null | undefined;
  uri?: string | null | undefined;
}

export interface AgentImagePartData {
  media_type: string;
  base64_data: string;
}

export interface AgentUnknownPartData extends Record<string, unknown> {}

export interface AgentMessagePartDataByType {
  text: null;
  thinking: null;
  status: null;
  image: AgentImagePartData;
  tool_call: AgentToolCallPartData;
  tool_result: AgentToolResultPartData;
  attachment_ref: AgentAttachmentRefPartData;
  approval_ref: AgentApprovalRefPartData;
  artifact_ref: AgentArtifactRefPartData;
}

export type AgentMessagePartData = AgentMessagePartDataByType[AgentMessagePartType];
export type AgentMessagePartDataOf<Type extends AgentMessagePartType> =
  AgentMessagePartDataByType[Type];

export interface AgentMessagePartRecord {
  id: string;
  message_id: string;
  session_id: string;
  part_index: number;
  part_type: AgentMessagePartType;
  text: string | null;
  data: string | null;
  created_at: string;
}

export interface AgentEventRecord {
  id: string;
  session_id: string;
  workspace_id: string;
  provider: AgentSessionProviderId;
  provider_session_id: string | null;
  turn_id: string | null;
  event_index: number;
  event_kind: string;
  payload: string;
  created_at: string;
}

export function parseAgentMessagePartData<Type extends AgentMessagePartType>(
  partType: Type,
  dataJson: string | null,
): AgentMessagePartDataOf<Type> | null {
  if (partType === "text" || partType === "thinking" || partType === "status") {
    return null;
  }

  if (!dataJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(dataJson) as AgentUnknownPartData;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as unknown as AgentMessagePartDataOf<Type>;
  } catch {
    return null;
  }
}

export function stringifyAgentMessagePartData(data: AgentMessagePartData | null): string | null {
  if (!data) {
    return null;
  }

  return JSON.stringify(data);
}
