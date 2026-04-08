import type { AgentInputPart } from "@lifecycle/contracts";

export interface AgentTurnRequest {
  agentId: string;
  workspaceId: string;
  turnId: string;
  input: AgentInputPart[];
}

export interface AgentTurnCancelRequest {
  agentId: string;
  turnId?: string | null;
}
