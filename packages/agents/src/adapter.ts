import type { AgentBackend, AgentRuntimeKind, AgentSessionRecord } from "@lifecycle/contracts";
import type { AgentEventObserver } from "./events";
import type { AgentRuntimeContext } from "./runtime";
import type {
  AgentApprovalResolution,
  AgentArtifactDescriptor,
  AgentApprovalRequest,
  AgentToolCallUpdate,
  AgentTurnCancelRequest,
  AgentTurnRequest,
} from "./turn";

export interface AgentAttachmentHandle {
  attachment_id: string;
  display_name?: string | null;
  media_type?: string | null;
  uri: string;
}

export interface AgentToolResult {
  output_json?: Record<string, unknown> | null;
  error_text?: string | null;
}

export interface AgentAdapterRuntime {
  emit: AgentEventObserver;
  runtime_context: AgentRuntimeContext;
  get_attachment?(attachment_id: string): Promise<AgentAttachmentHandle>;
  report_tool_call?(update: AgentToolCallUpdate): Promise<void>;
  report_approval_request?(request: AgentApprovalRequest): Promise<void>;
  report_artifact?(artifact: AgentArtifactDescriptor): Promise<void>;
}

export interface AgentBackendSessionCreateInput {
  workspace_id: string;
  backend: AgentBackend;
  title?: string;
  runtime_kind?: AgentRuntimeKind;
  runtime_session_id?: string | null;
  forked_from_session_id?: string | null;
}

export interface AgentBackendSession {
  session: AgentSessionRecord;
}

export interface AgentBackendSessionBootstrap {
  session: AgentSessionRecord;
  runtime_context: AgentRuntimeContext;
}

export interface AgentBackendAdapter {
  readonly backend: AgentBackend;
  create_session(
    input: AgentBackendSessionBootstrap,
    runtime: AgentAdapterRuntime,
  ): Promise<AgentBackendSession>;
  send_turn(
    input: AgentTurnRequest,
    session: AgentSessionRecord,
    runtime: AgentAdapterRuntime,
  ): Promise<void>;
  cancel_turn(
    input: AgentTurnCancelRequest,
    session: AgentSessionRecord,
    runtime: AgentAdapterRuntime,
  ): Promise<void>;
  resolve_approval(
    input: AgentApprovalResolution,
    session: AgentSessionRecord,
    runtime: AgentAdapterRuntime,
  ): Promise<void>;
}
