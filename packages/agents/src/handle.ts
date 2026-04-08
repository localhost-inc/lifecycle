import type { AgentApprovalResolution, AgentProviderRequestResolution } from "@lifecycle/contracts";
import type { AgentStreamEvent, AgentStreamSnapshot } from "./stream-protocol";
import type { AgentTurnCancelRequest, AgentTurnRequest } from "./turn";

export interface AgentCallbacks {
  onState(snapshot: AgentStreamSnapshot): void | Promise<void>;
  onEvent(event: AgentStreamEvent): void | Promise<void>;
}

export interface AgentHandle {
  sendTurn(input: AgentTurnRequest): Promise<void>;
  cancelTurn(input: AgentTurnCancelRequest): Promise<void>;
  resolveApproval(input: AgentApprovalResolution): Promise<void>;
  resolveProviderRequest?(
    input: Omit<AgentProviderRequestResolution, "metadata">,
  ): Promise<void>;
  /** Returns true if the underlying connection is still alive. */
  isHealthy?: () => boolean;
}
