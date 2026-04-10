import { z } from "zod";

export const AgentProviderIdSchema = z.enum(["claude", "codex"]).meta({ id: "AgentProviderId" });
export type AgentProviderId = z.infer<typeof AgentProviderIdSchema>;

export const AgentMessageRoleSchema = z
  .enum(["user", "assistant", "system", "tool"])
  .meta({ id: "AgentMessageRole" });
export type AgentMessageRole = z.infer<typeof AgentMessageRoleSchema>;

export const AgentStatusSchema = z
  .enum([
    "starting",
    "idle",
    "running",
    "waiting_input",
    "waiting_approval",
    "completed",
    "failed",
    "cancelled",
  ])
  .meta({ id: "AgentStatus" });
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentRecordSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string(),
    provider: AgentProviderIdSchema,
    provider_id: z.string().nullable(),
    title: z.string(),
    status: AgentStatusSchema,
    last_message_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: "AgentRecord" });
export type AgentRecord = z.infer<typeof AgentRecordSchema>;

export const AgentMessageRecordSchema = z
  .object({
    id: z.string(),
    agent_id: z.string(),
    role: AgentMessageRoleSchema,
    text: z.string(),
    turn_id: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ id: "AgentMessageRecord" });
export type AgentMessageRecord = z.infer<typeof AgentMessageRecordSchema>;

/** Hydrated message with inline parts — the shape the UI consumes. */
export const AgentMessagePartTypeSchema = z
  .enum([
    "text",
    "thinking",
    "status",
    "image",
    "tool_call",
    "tool_result",
    "attachment_ref",
    "approval_ref",
    "artifact_ref",
  ])
  .meta({ id: "AgentMessagePartType" });
export type AgentMessagePartType = z.infer<typeof AgentMessagePartTypeSchema>;

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

export const AgentMessagePartRecordSchema = z
  .object({
    id: z.string(),
    message_id: z.string(),
    agent_id: z.string(),
    part_index: z.number().int(),
    part_type: AgentMessagePartTypeSchema,
    text: z.string().nullable(),
    data: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ id: "AgentMessagePartRecord" });
export type AgentMessagePartRecord = z.infer<typeof AgentMessagePartRecordSchema>;

/** Hydrated message with inline parts — the shape the UI consumes. */
export const AgentMessageWithPartsSchema = AgentMessageRecordSchema.extend({
  parts: z.array(AgentMessagePartRecordSchema),
}).meta({ id: "AgentMessageWithParts" });
export type AgentMessageWithParts = z.infer<typeof AgentMessageWithPartsSchema>;

export interface AgentEventRecord {
  id: string;
  agent_id: string;
  workspace_id: string;
  provider: AgentProviderId;
  provider_id: string | null;
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
