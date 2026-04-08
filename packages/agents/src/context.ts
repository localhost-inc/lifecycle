import type { WorkspaceHost } from "@lifecycle/contracts";

export interface AgentContext {
  workspaceId: string;
  workspaceHost: WorkspaceHost;
  workspaceRoot?: string | null;
}
