import type { WorkspaceTarget } from "@lifecycle/contracts";

export interface AgentRuntimeContext {
  workspace_id: string;
  workspace_target: WorkspaceTarget;
  worktree_path?: string | null;
}

export interface AgentRuntimeResolver {
  resolve(workspace_id: string): Promise<AgentRuntimeContext>;
}
