export type AgentBackend = "claude" | "codex";

export type AgentRuntimeKind = "native" | "adapter";
export type AgentMessageRole = "user" | "assistant";

export type AgentSessionStatus =
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
  backend: AgentBackend;
  runtime_session_id: string | null;
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
}
