export type AgentInputPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "attachment_ref";
      attachment_id: string;
    };

export type AgentMessageRole = "user" | "assistant" | "system" | "tool";

export type AgentMessagePart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "thinking";
      text: string;
    }
  | {
      type: "status";
      text: string;
    }
  | {
      type: "attachment_ref";
      attachment_id: string;
    }
  | {
      type: "tool_call";
      tool_call_id: string;
      tool_name: string;
    }
  | {
      type: "tool_result";
      tool_call_id: string;
    }
  | {
      type: "approval_ref";
      approval_id: string;
    }
  | {
      type: "artifact_ref";
      artifact_id: string;
    };

export interface AgentTurnRequest {
  session_id: string;
  workspace_id: string;
  turn_id: string;
  input: AgentInputPart[];
}

export interface AgentTurnCancelRequest {
  session_id: string;
  turn_id?: string | null;
}

export type AgentToolCallStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentToolCallUpdate {
  id: string;
  session_id: string;
  tool_name: string;
  status: AgentToolCallStatus;
  input_json: Record<string, unknown>;
  output_json?: Record<string, unknown> | null;
  error_text?: string | null;
}

export type AgentApprovalKind =
  | "tool"
  | "shell"
  | "network"
  | "file_write"
  | "file_delete"
  | "question"
  | "handoff";

export type AgentApprovalStatus =
  | "pending"
  | "approved_once"
  | "approved_session"
  | "rejected"
  | "expired";

export type AgentApprovalDecision = "approve_once" | "approve_session" | "reject";

export interface AgentApprovalRequest {
  id: string;
  session_id: string;
  kind: AgentApprovalKind;
  scope_key: string;
  status: AgentApprovalStatus;
  message: string;
  metadata_json?: Record<string, unknown> | null;
}

export interface AgentApprovalResolution {
  approval_id: string;
  session_id: string;
  decision: AgentApprovalDecision;
}

export type AgentArtifactType =
  | "diff"
  | "file"
  | "link"
  | "preview"
  | "note"
  | "report"
  | "command_output";

export interface AgentArtifactDescriptor {
  id: string;
  session_id: string;
  artifact_type: AgentArtifactType;
  title: string;
  uri: string;
  metadata_json?: Record<string, unknown> | null;
}
