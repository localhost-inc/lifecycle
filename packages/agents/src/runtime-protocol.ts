import type { AgentSessionProviderId, AgentSessionStatus } from "@lifecycle/contracts";
import type {
  AgentApprovalDecision,
  AgentApprovalKind,
  AgentApprovalRequest,
  AgentApprovalResolution,
  AgentImageMediaType,
} from "./turn";

export type AgentRuntimeApprovalRequestPayload = Omit<AgentApprovalRequest, "sessionId">;
export type AgentRuntimeApprovalResolutionPayload = Omit<AgentApprovalResolution, "sessionId">;

// ---------------------------------------------------------------------------
// Runtime lifecycle events
// ---------------------------------------------------------------------------

export interface AgentRuntimeReadyEvent {
  kind: "worker.ready";
  providerSessionId: string;
}

export interface AgentRuntimeAuthStatusEvent {
  kind: "worker.auth_status";
  isAuthenticating: boolean;
  output: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Streaming delta events (real-time content display)
// ---------------------------------------------------------------------------

export interface AgentRuntimeMessageDeltaEvent {
  kind: "agent.message.delta";
  text: string;
  turnId: string;
  /** Opaque identifier for the content block within a turn. Distinct text blocks get distinct IDs. */
  blockId: string;
}

export interface AgentRuntimeThinkingDeltaEvent {
  kind: "agent.thinking.delta";
  text: string;
  turnId: string;
  blockId: string;
}

export interface AgentRuntimeToolUseStartEvent {
  kind: "agent.tool_use.start";
  toolName: string;
  toolUseId: string;
  turnId: string;
}

export interface AgentRuntimeToolUseInputEvent {
  kind: "agent.tool_use.input";
  toolName: string;
  toolUseId: string;
  inputJson: string;
  turnId: string;
}

export interface AgentRuntimeToolProgressEvent {
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

export type AgentRuntimeItemStatus = "running" | "completed" | "failed";

export type AgentRuntimeItem =
  | { id: string; type: "agent_message"; text: string }
  | { id: string; type: "reasoning"; text: string }
  | {
      id: string;
      type: "command_execution";
      command: string;
      output: string;
      exitCode?: number;
      status: AgentRuntimeItemStatus;
    }
  | {
      id: string;
      type: "file_change";
      changes: { path: string; kind: "add" | "delete" | "update"; diff?: string }[];
      diff?: string;
      status: AgentRuntimeItemStatus;
    }
  | {
      id: string;
      type: "tool_call";
      toolName: string;
      toolCallId: string;
      inputJson?: string;
      outputJson?: string;
      errorText?: string;
      status: AgentRuntimeItemStatus;
    }
  | { id: string; type: "error"; message: string };

export interface AgentRuntimeItemStartedEvent {
  kind: "agent.item.started";
  item: AgentRuntimeItem;
  turnId: string;
}

export interface AgentRuntimeItemUpdatedEvent {
  kind: "agent.item.updated";
  item: AgentRuntimeItem;
  turnId: string;
}

export interface AgentRuntimeItemCompletedEvent {
  kind: "agent.item.completed";
  item: AgentRuntimeItem;
  turnId: string;
}

// ---------------------------------------------------------------------------
// Status events (compacting, rate limiting, etc.)
// ---------------------------------------------------------------------------

export interface AgentRuntimeStatusEvent {
  kind: "agent.status";
  status: string;
  detail?: string | undefined;
  turnId: string;
}

// ---------------------------------------------------------------------------
// Approval / user-input events
// ---------------------------------------------------------------------------

export interface AgentRuntimeApprovalRequestedEvent {
  approval: AgentRuntimeApprovalRequestPayload;
  kind: "agent.approval.requested";
  turnId: string;
}

export interface AgentRuntimeApprovalResolvedEvent {
  kind: "agent.approval.resolved";
  resolution: AgentRuntimeApprovalResolutionPayload;
  turnId: string;
}

// ---------------------------------------------------------------------------
// Turn lifecycle events
// ---------------------------------------------------------------------------

export interface AgentRuntimeTurnCompletedEvent {
  kind: "agent.turn.completed";
  turnId: string;
  usage?:
    | {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number | undefined;
      }
    | undefined;
  costUsd?: number | undefined;
}

export interface AgentRuntimeTurnFailedEvent {
  kind: "agent.turn.failed";
  error: string;
  turnId: string;
}

// ---------------------------------------------------------------------------
// Session metadata events
// ---------------------------------------------------------------------------

export interface AgentRuntimeTitleGeneratedEvent {
  kind: "worker.title_generated";
  title: string;
}

// ---------------------------------------------------------------------------
// Aggregate union
// ---------------------------------------------------------------------------

export type AgentRuntimeEvent =
  // Runtime lifecycle
  | AgentRuntimeReadyEvent
  | AgentRuntimeAuthStatusEvent
  // Streaming deltas
  | AgentRuntimeMessageDeltaEvent
  | AgentRuntimeThinkingDeltaEvent
  | AgentRuntimeToolUseStartEvent
  | AgentRuntimeToolUseInputEvent
  | AgentRuntimeToolProgressEvent
  // Item lifecycle
  | AgentRuntimeItemStartedEvent
  | AgentRuntimeItemUpdatedEvent
  | AgentRuntimeItemCompletedEvent
  // Approvals / user input
  | AgentRuntimeApprovalRequestedEvent
  | AgentRuntimeApprovalResolvedEvent
  // Status
  | AgentRuntimeStatusEvent
  // Turn lifecycle
  | AgentRuntimeTurnCompletedEvent
  | AgentRuntimeTurnFailedEvent
  // Session metadata
  | AgentRuntimeTitleGeneratedEvent;

// ---------------------------------------------------------------------------
// Commands (host → runtime)
// ---------------------------------------------------------------------------

export type AgentRuntimeInputPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: AgentImageMediaType; base64Data: string };

export interface AgentRuntimeSendTurnCommand {
  kind: "worker.send_turn";
  input: AgentRuntimeInputPart[];
  turnId: string;
}

export interface AgentRuntimeCancelTurnCommand {
  kind: "worker.cancel_turn";
  turnId?: string | null;
}

export interface AgentRuntimeResolveApprovalCommand {
  approvalId: string;
  decision: AgentApprovalDecision;
  kind: "worker.resolve_approval";
  response?: Record<string, unknown> | null;
}

export type AgentRuntimeCommand =
  | AgentRuntimeSendTurnCommand
  | AgentRuntimeCancelTurnCommand
  | AgentRuntimeResolveApprovalCommand;

// ---------------------------------------------------------------------------
// Runtime state — snapshot and registration for reconnectable sessions
// ---------------------------------------------------------------------------

export type AgentRuntimeStatus = AgentSessionStatus;

export interface AgentRuntimePendingApproval {
  id: string;
  kind: AgentApprovalKind;
}

export interface AgentRuntimeSnapshot {
  kind: "worker.state";
  provider: AgentSessionProviderId;
  providerSessionId: string | null;
  sessionId: string;
  status: AgentRuntimeStatus;
  activeTurnId: string | null;
  pendingApproval: AgentRuntimePendingApproval | null;
  updatedAt: string;
}

export interface AgentRuntimeRegistration {
  provider: AgentSessionProviderId;
  providerSessionId: string | null;
  sessionId: string;
  pid: number;
  port: number;
  token: string;
  status: AgentRuntimeStatus;
  activeTurnId: string | null;
  pendingApproval: AgentRuntimePendingApproval | null;
  updatedAt: string;
}
