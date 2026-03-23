import type { AgentApprovalDecision, AgentApprovalRequest, AgentApprovalResolution } from "./turn";

export type AgentWorkerApprovalRequestPayload = Omit<AgentApprovalRequest, "session_id">;
export type AgentWorkerApprovalResolutionPayload = Omit<AgentApprovalResolution, "session_id">;

// ---------------------------------------------------------------------------
// Worker lifecycle events
// ---------------------------------------------------------------------------

export interface AgentWorkerReadyEvent {
  kind: "worker.ready";
  provider_session_id: string;
}

export interface AgentWorkerAuthStatusEvent {
  kind: "worker.auth_status";
  is_authenticating: boolean;
  output: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Streaming delta events (real-time content display)
// ---------------------------------------------------------------------------

export interface AgentWorkerMessageDeltaEvent {
  kind: "agent.message.delta";
  text: string;
  turn_id: string;
  /** Content block index from the SDK stream. Distinct text blocks get distinct indices. */
  block_index: number;
}

export interface AgentWorkerThinkingDeltaEvent {
  kind: "agent.thinking.delta";
  text: string;
  turn_id: string;
  block_index: number;
}

export interface AgentWorkerToolUseStartEvent {
  kind: "agent.tool_use.start";
  tool_name: string;
  tool_use_id: string;
  turn_id: string;
}

export interface AgentWorkerToolUseInputEvent {
  kind: "agent.tool_use.input";
  tool_name: string;
  tool_use_id: string;
  input_json: string;
  turn_id: string;
}

export interface AgentWorkerToolProgressEvent {
  kind: "agent.tool_progress";
  tool_name: string;
  tool_use_id: string;
  elapsed_time_seconds: number;
  turn_id: string;
}

// ---------------------------------------------------------------------------
// Item lifecycle events — modeled after Codex SDK ThreadItem / ThreadEvent.
// Items represent discrete, structured units of work within a turn.
// ---------------------------------------------------------------------------

export type AgentWorkerItemStatus = "in_progress" | "completed" | "failed";

export type AgentWorkerItem =
  | { id: string; type: "agent_message"; text: string }
  | { id: string; type: "reasoning"; text: string }
  | {
      id: string;
      type: "command_execution";
      command: string;
      output: string;
      exit_code?: number;
      status: AgentWorkerItemStatus;
    }
  | {
      id: string;
      type: "file_change";
      changes: { path: string; kind: "add" | "delete" | "update" }[];
      status: "completed" | "failed";
    }
  | {
      id: string;
      type: "tool_call";
      tool_name: string;
      tool_call_id: string;
      input_json?: string;
      output_json?: string;
      error_text?: string;
      status: AgentWorkerItemStatus;
    }
  | { id: string; type: "error"; message: string };

export interface AgentWorkerItemStartedEvent {
  kind: "agent.item.started";
  item: AgentWorkerItem;
  turn_id: string;
}

export interface AgentWorkerItemUpdatedEvent {
  kind: "agent.item.updated";
  item: AgentWorkerItem;
  turn_id: string;
}

export interface AgentWorkerItemCompletedEvent {
  kind: "agent.item.completed";
  item: AgentWorkerItem;
  turn_id: string;
}

// ---------------------------------------------------------------------------
// Status events (compacting, rate limiting, etc.)
// ---------------------------------------------------------------------------

export interface AgentWorkerStatusEvent {
  kind: "agent.status";
  status: string;
  detail?: string | undefined;
  turn_id: string;
}

// ---------------------------------------------------------------------------
// Approval / user-input events
// ---------------------------------------------------------------------------

export interface AgentWorkerApprovalRequestedEvent {
  approval: AgentWorkerApprovalRequestPayload;
  kind: "agent.approval.requested";
  turn_id: string;
}

export interface AgentWorkerApprovalResolvedEvent {
  kind: "agent.approval.resolved";
  resolution: AgentWorkerApprovalResolutionPayload;
  turn_id: string;
}

// ---------------------------------------------------------------------------
// Turn lifecycle events
// ---------------------------------------------------------------------------

export interface AgentWorkerTurnCompletedEvent {
  kind: "agent.turn.completed";
  turn_id: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens?: number | undefined;
  } | undefined;
  cost_usd?: number | undefined;
}

export interface AgentWorkerTurnFailedEvent {
  kind: "agent.turn.failed";
  error: string;
  turn_id: string;
}

// ---------------------------------------------------------------------------
// Aggregate union
// ---------------------------------------------------------------------------

export type AgentWorkerEvent =
  // Worker lifecycle
  | AgentWorkerReadyEvent
  | AgentWorkerAuthStatusEvent
  // Streaming deltas
  | AgentWorkerMessageDeltaEvent
  | AgentWorkerThinkingDeltaEvent
  | AgentWorkerToolUseStartEvent
  | AgentWorkerToolUseInputEvent
  | AgentWorkerToolProgressEvent
  // Item lifecycle
  | AgentWorkerItemStartedEvent
  | AgentWorkerItemUpdatedEvent
  | AgentWorkerItemCompletedEvent
  // Approvals / user input
  | AgentWorkerApprovalRequestedEvent
  | AgentWorkerApprovalResolvedEvent
  // Status
  | AgentWorkerStatusEvent
  // Turn lifecycle
  | AgentWorkerTurnCompletedEvent
  | AgentWorkerTurnFailedEvent;

// ---------------------------------------------------------------------------
// Commands (host → worker)
// ---------------------------------------------------------------------------

export interface AgentWorkerSendTurnCommand {
  kind: "worker.send_turn";
  input: string;
  turn_id: string;
}

export interface AgentWorkerCancelTurnCommand {
  kind: "worker.cancel_turn";
  turn_id?: string | null;
}

export interface AgentWorkerResolveApprovalCommand {
  approval_id: string;
  decision: AgentApprovalDecision;
  kind: "worker.resolve_approval";
  response?: Record<string, unknown> | null;
}

export type AgentWorkerCommand =
  | AgentWorkerSendTurnCommand
  | AgentWorkerCancelTurnCommand
  | AgentWorkerResolveApprovalCommand;
