import type { WorkspaceRecord } from "@lifecycle/contracts";

export function workspaceSupportsFilesystemInteraction(
  workspace: Pick<WorkspaceRecord, "mode" | "status" | "worktree_path">,
): boolean {
  return workspace.mode === "local" && workspace.worktree_path !== null;
}
