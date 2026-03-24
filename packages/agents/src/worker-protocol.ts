import type { AgentApprovalDecision, AgentApprovalRequest, AgentApprovalResolution } from "./turn";

export type AgentWorkerApprovalRequestPayload = Omit<AgentApprovalRequest, "sessionId">;
export type AgentWorkerApprovalResolutionPayload = Omit<AgentApprovalResolution, "sessionId">;

// ---------------------------------------------------------------------------
// Worker lifecycle events
// ---------------------------------------------------------------------------

export interface AgentWorkerReadyEvent {
  kind: "worker.ready";
  providerSessionId: string;
}

export interface AgentWorkerAuthStatusEvent {
  kind: "worker.auth_status";
  isAuthenticating: boolean;
  output: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Streaming delta events (real-time content display)
// ---------------------------------------------------------------------------

export interface AgentWorkerMessageDeltaEvent {
  kind: "agent.message.delta";
  text: string;
  turnId: string;
  /** Opaque identifier for the content block within a turn. Distinct text blocks get distinct IDs. */
  blockId: string;
}

export interface AgentWorkerThinkingDeltaEvent {
  kind: "agent.thinking.delta";
  text: string;
  turnId: string;
  blockId: string;
}

export interface AgentWorkerToolUseStartEvent {
  kind: "agent.tool_use.start";
  toolName: string;
  toolUseId: string;
  turnId: string;
}

export interface AgentWorkerToolUseInputEvent {
  kind: "agent.tool_use.input";
  toolName: string;
  toolUseId: string;
  inputJson: string;
  turnId: string;
}

export interface AgentWorkerToolProgressEvent {
  kind: "agent.tool_progress";
  toolName: string;
  toolUseId: string;
  elapsedTimeSeconds: number;
  turnId: string;
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
      exitCode?: number;
      status: AgentWorkerItemStatus;
    }
  | {
      id: string;
      type: "file_change";
      changes: { path: string; kind: "add" | "delete" | "update"; diff?: string }[];
      diff?: string;
      status: AgentWorkerItemStatus;
    }
  | {
      id: string;
      type: "tool_call";
      toolName: string;
      toolCallId: string;
      inputJson?: string;
      outputJson?: string;
      errorText?: string;
      status: AgentWorkerItemStatus;
    }
  | { id: string; type: "error"; message: string };

export interface AgentWorkerItemStartedEvent {
  kind: "agent.item.started";
  item: AgentWorkerItem;
  turnId: string;
}

export interface AgentWorkerItemUpdatedEvent {
  kind: "agent.item.updated";
  item: AgentWorkerItem;
  turnId: string;
}

export interface AgentWorkerItemCompletedEvent {
  kind: "agent.item.completed";
  item: AgentWorkerItem;
  turnId: string;
}

// ---------------------------------------------------------------------------
// Status events (compacting, rate limiting, etc.)
// ---------------------------------------------------------------------------

export interface AgentWorkerStatusEvent {
  kind: "agent.status";
  status: string;
  detail?: string | undefined;
  turnId: string;
}

// ---------------------------------------------------------------------------
// Approval / user-input events
// ---------------------------------------------------------------------------

export interface AgentWorkerApprovalRequestedEvent {
  approval: AgentWorkerApprovalRequestPayload;
  kind: "agent.approval.requested";
  turnId: string;
}

export interface AgentWorkerApprovalResolvedEvent {
  kind: "agent.approval.resolved";
  resolution: AgentWorkerApprovalResolutionPayload;
  turnId: string;
}

// ---------------------------------------------------------------------------
// Turn lifecycle events
// ---------------------------------------------------------------------------

export interface AgentWorkerTurnCompletedEvent {
  kind: "agent.turn.completed";
  turnId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number | undefined;
  } | undefined;
  costUsd?: number | undefined;
}

export interface AgentWorkerTurnFailedEvent {
  kind: "agent.turn.failed";
  error: string;
  turnId: string;
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
  turnId: string;
}

export interface AgentWorkerCancelTurnCommand {
  kind: "worker.cancel_turn";
  turnId?: string | null;
}

export interface AgentWorkerResolveApprovalCommand {
  approvalId: string;
  decision: AgentApprovalDecision;
  kind: "worker.resolve_approval";
  response?: Record<string, unknown> | null;
}

export type AgentWorkerCommand =
  | AgentWorkerSendTurnCommand
  | AgentWorkerCancelTurnCommand
  | AgentWorkerResolveApprovalCommand;
