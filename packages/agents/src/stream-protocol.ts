import type {
  AgentApprovalDecision,
  AgentApprovalKind,
  AgentApprovalRequest,
  AgentApprovalResolution,
  AgentProviderId,
  AgentStatus,
  AgentImageMediaType,
  AgentItem,
  AgentItemDelta,
  AgentProviderRequest,
  AgentProviderRequestResolution,
  AgentProviderSignal,
} from "@lifecycle/contracts";

export type AgentApprovalRequestPayload = Omit<AgentApprovalRequest, "agentId">;
export type AgentApprovalResolutionPayload = Omit<AgentApprovalResolution, "agentId">;

export interface AgentReadyEvent {
  kind: "agent.ready";
  providerId: string;
}

export interface AgentAuthStatusEvent {
  kind: "agent.auth_status";
  isAuthenticating: boolean;
  output: string[];
  error?: string;
}

export interface AgentMessageDeltaEvent {
  kind: "agent.message.delta";
  text: string;
  turnId: string;
  blockId: string;
}

export interface AgentThinkingDeltaEvent {
  kind: "agent.thinking.delta";
  text: string;
  turnId: string;
  blockId: string;
}

export interface AgentToolUseStartEvent {
  kind: "agent.tool_use.start";
  toolName: string;
  toolUseId: string;
  turnId: string;
}

export interface AgentToolUseInputEvent {
  kind: "agent.tool_use.input";
  toolName: string;
  toolUseId: string;
  inputJson: string;
  turnId: string;
}

export interface AgentToolProgressEvent {
  kind: "agent.tool_progress";
  toolName: string;
  toolUseId: string;
  elapsedTimeSeconds: number;
  turnId: string;
}

export interface AgentItemStartedEvent {
  kind: "agent.item.started";
  item: AgentItem;
  turnId: string;
}

export interface AgentItemUpdatedEvent {
  kind: "agent.item.updated";
  item: AgentItem;
  turnId: string;
}

export interface AgentItemCompletedEvent {
  kind: "agent.item.completed";
  item: AgentItem;
  turnId: string;
}

export interface AgentItemDeltaEvent {
  delta: AgentItemDelta;
  kind: "agent.item.delta";
  turnId: string;
}

export interface AgentStatusEvent {
  kind: "agent.status";
  status: string;
  detail?: string | undefined;
  turnId: string;
}

export interface AgentRawProviderEvent {
  kind: "agent.raw_event";
  eventType: string;
  payload: unknown;
  turnId?: string | null;
}

export interface AgentProviderSignalEvent {
  kind: "agent.provider.signal";
  signal: AgentProviderSignal;
  turnId?: string | null;
}

export interface AgentProviderRequestEvent {
  kind: "agent.provider.requested";
  request: AgentProviderRequest;
  turnId?: string | null;
}

export interface AgentProviderRequestResolvedEvent {
  kind: "agent.provider.request.resolved";
  resolution: AgentProviderRequestResolution;
  turnId?: string | null;
}

export interface AgentApprovalRequestedEvent {
  approval: AgentApprovalRequestPayload;
  kind: "agent.approval.requested";
  turnId: string;
}

export interface AgentApprovalResolvedEvent {
  kind: "agent.approval.resolved";
  resolution: AgentApprovalResolutionPayload;
  turnId: string;
}

export interface AgentTurnCompletedEvent {
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

export interface AgentTurnFailedEvent {
  kind: "agent.turn.failed";
  error: string;
  turnId: string;
}

export interface AgentTitleGeneratedEvent {
  kind: "agent.title_generated";
  title: string;
}

export type AgentStreamEvent =
  | AgentReadyEvent
  | AgentAuthStatusEvent
  | AgentMessageDeltaEvent
  | AgentThinkingDeltaEvent
  | AgentToolUseStartEvent
  | AgentToolUseInputEvent
  | AgentToolProgressEvent
  | AgentItemStartedEvent
  | AgentItemUpdatedEvent
  | AgentItemCompletedEvent
  | AgentItemDeltaEvent
  | AgentApprovalRequestedEvent
  | AgentApprovalResolvedEvent
  | AgentStatusEvent
  | AgentRawProviderEvent
  | AgentProviderSignalEvent
  | AgentProviderRequestEvent
  | AgentProviderRequestResolvedEvent
  | AgentTurnCompletedEvent
  | AgentTurnFailedEvent
  | AgentTitleGeneratedEvent;

export type AgentInputPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: AgentImageMediaType; base64Data: string };

export interface AgentSendTurnCommand {
  kind: "agent.send_turn";
  input: AgentInputPart[];
  turnId: string;
}

export interface AgentCancelTurnCommand {
  kind: "agent.cancel_turn";
  turnId?: string | null;
}

export interface AgentResolveApprovalCommand {
  approvalId: string;
  decision: AgentApprovalDecision;
  kind: "agent.resolve_approval";
  response?: Record<string, unknown> | null;
}

export interface AgentResolveProviderRequestCommand {
  kind: "agent.resolve_request";
  outcome: AgentProviderRequestResolution["outcome"];
  requestId: string;
  response?: Record<string, unknown> | null;
}

export type AgentCommand =
  | AgentSendTurnCommand
  | AgentCancelTurnCommand
  | AgentResolveApprovalCommand
  | AgentResolveProviderRequestCommand;

export interface AgentPendingApproval {
  id: string;
  kind: AgentApprovalKind;
}

export interface AgentStreamSnapshot {
  kind: "agent.state";
  provider: AgentProviderId;
  providerId: string | null;
  agentId: string;
  status: AgentStatus;
  activeTurnId: string | null;
  pendingApproval: AgentPendingApproval | null;
  updatedAt: string;
}

export interface AgentRegistration {
  provider: AgentProviderId;
  providerId: string | null;
  agentId: string;
  pid: number;
  port: number;
  token: string;
  status: AgentStatus;
  activeTurnId: string | null;
  pendingApproval: AgentPendingApproval | null;
  updatedAt: string;
}
