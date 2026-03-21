import type { WorkspaceRecord } from "@lifecycle/contracts";

export function workspaceSupportsFilesystemInteraction(
  workspace: Pick<WorkspaceRecord, "target" | "worktree_path">,
): boolean {
  return workspace.target === "host" && workspace.worktree_path !== null;
}
