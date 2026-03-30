import type { AgentSessionProviderId, AgentSessionStatus } from "@lifecycle/contracts";
import type {
  AgentApprovalDecision,
  AgentApprovalKind,
  AgentApprovalRequest,
  AgentApprovalResolution,
  AgentImageMediaType,
} from "../turn";

export type AgentWorkerApprovalRequestPayload = Omit<AgentApprovalRequest, "sessionId">;
export type AgentWorkerApprovalResolutionPayload = Omit<AgentApprovalResolution, "sessionId">;

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

export interface AgentWorkerMessageDeltaEvent {
  kind: "agent.message.delta";
  text: string;
  turnId: string;
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

export type AgentWorkerItemStatus = "running" | "completed" | "failed";

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

export interface AgentWorkerStatusEvent {
  kind: "agent.status";
  status: string;
  detail?: string | undefined;
  turnId: string;
}

export interface AgentWorkerRawProviderEvent {
  kind: "provider.raw_event";
  eventType: string;
  payload: unknown;
  turnId?: string | null;
}

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

export interface AgentWorkerTurnCompletedEvent {
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

export interface AgentWorkerTurnFailedEvent {
  kind: "agent.turn.failed";
  error: string;
  turnId: string;
}

export interface AgentWorkerTitleGeneratedEvent {
  kind: "worker.title_generated";
  title: string;
}

export type AgentWorkerEvent =
  | AgentWorkerReadyEvent
  | AgentWorkerAuthStatusEvent
  | AgentWorkerMessageDeltaEvent
  | AgentWorkerThinkingDeltaEvent
  | AgentWorkerToolUseStartEvent
  | AgentWorkerToolUseInputEvent
  | AgentWorkerToolProgressEvent
  | AgentWorkerItemStartedEvent
  | AgentWorkerItemUpdatedEvent
  | AgentWorkerItemCompletedEvent
  | AgentWorkerApprovalRequestedEvent
  | AgentWorkerApprovalResolvedEvent
  | AgentWorkerStatusEvent
  | AgentWorkerRawProviderEvent
  | AgentWorkerTurnCompletedEvent
  | AgentWorkerTurnFailedEvent
  | AgentWorkerTitleGeneratedEvent;

export type AgentWorkerInputPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: AgentImageMediaType; base64Data: string };

export interface AgentWorkerSendTurnCommand {
  kind: "worker.send_turn";
  input: AgentWorkerInputPart[];
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

export type AgentWorkerStatus = AgentSessionStatus;

export interface AgentWorkerPendingApproval {
  id: string;
  kind: AgentApprovalKind;
}

export interface AgentWorkerSnapshot {
  kind: "worker.state";
  provider: AgentSessionProviderId;
  providerSessionId: string | null;
  sessionId: string;
  status: AgentWorkerStatus;
  activeTurnId: string | null;
  pendingApproval: AgentWorkerPendingApproval | null;
  updatedAt: string;
}

export interface AgentWorkerRegistration {
  provider: AgentSessionProviderId;
  providerSessionId: string | null;
  sessionId: string;
  pid: number;
  port: number;
  token: string;
  status: AgentWorkerStatus;
  activeTurnId: string | null;
  pendingApproval: AgentWorkerPendingApproval | null;
  updatedAt: string;
}
