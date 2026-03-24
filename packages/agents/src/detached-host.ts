import type { AgentSessionProviderId, AgentSessionStatus } from "@lifecycle/contracts";
import type { AgentApprovalKind } from "./turn";

export type DetachedAgentHostStatus = AgentSessionStatus;

export interface DetachedAgentHostPendingApproval {
  id: string;
  kind: AgentApprovalKind;
}

export interface DetachedAgentHostSnapshot {
  kind: "worker.state";
  provider: AgentSessionProviderId;
  providerSessionId: string | null;
  sessionId: string;
  status: DetachedAgentHostStatus;
  activeTurnId: string | null;
  pendingApproval: DetachedAgentHostPendingApproval | null;
  updatedAt: string;
}

export interface DetachedAgentHostRegistration {
  provider: AgentSessionProviderId;
  providerSessionId: string | null;
  sessionId: string;
  pid: number;
  port: number;
  token: string;
  status: DetachedAgentHostStatus;
  activeTurnId: string | null;
  pendingApproval: DetachedAgentHostPendingApproval | null;
  updatedAt: string;
}
