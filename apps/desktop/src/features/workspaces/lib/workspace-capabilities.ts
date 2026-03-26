import type { WorkspaceRecord } from "@lifecycle/contracts";

export function workspaceSupportsFilesystemInteraction(
  workspace: Pick<WorkspaceRecord, "host" | "worktree_path">,
): boolean {
  return (
    (workspace.host === "local" || workspace.host === "docker") && workspace.worktree_path !== null
  );
}
