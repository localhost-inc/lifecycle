export type AgentInputPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "attachment_ref";
      attachmentId: string;
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
      attachmentId: string;
    }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      inputJson?: string | undefined;
      outputJson?: string | null | undefined;
      status?: AgentToolCallStatus | null | undefined;
      errorText?: string | null | undefined;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      outputJson?: string | null | undefined;
      errorText?: string | null | undefined;
    }
  | {
      type: "approval_ref";
      approvalId: string;
      decision?: AgentApprovalDecision | null | undefined;
      kind?: AgentApprovalKind | null | undefined;
      message?: string | null | undefined;
      metadata?: Record<string, unknown> | null | undefined;
      status?: AgentApprovalStatus | null | undefined;
    }
  | {
      type: "artifact_ref";
      artifactId: string;
      artifactType?: AgentArtifactType | null | undefined;
      title?: string | null | undefined;
      uri?: string | null | undefined;
    };

export interface AgentTurnRequest {
  sessionId: string;
  workspaceId: string;
  turnId: string;
  input: AgentInputPart[];
}

export interface AgentTurnCancelRequest {
  sessionId: string;
  turnId?: string | null;
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
  sessionId: string;
  toolName: string;
  status: AgentToolCallStatus;
  inputJson: Record<string, unknown>;
  outputJson?: Record<string, unknown> | null;
  errorText?: string | null;
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
  sessionId: string;
  kind: AgentApprovalKind;
  scopeKey: string;
  status: AgentApprovalStatus;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface AgentApprovalResolution {
  approvalId: string;
  sessionId: string;
  decision: AgentApprovalDecision;
  response?: Record<string, unknown> | null;
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
  sessionId: string;
  artifactType: AgentArtifactType;
  title: string;
  uri: string;
  metadataJson?: Record<string, unknown> | null;
}
