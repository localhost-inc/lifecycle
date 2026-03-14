import type { WorkspaceRecord } from "@lifecycle/contracts";

function compareLastActiveDesc(left: WorkspaceRecord, right: WorkspaceRecord): number {
  return Date.parse(right.last_active_at) - Date.parse(left.last_active_at);
}

export function resolveProjectRepoWorkspace(
  workspaces: readonly WorkspaceRecord[],
): WorkspaceRecord | null {
  if (workspaces.length === 0) {
    return null;
  }

  const rootWorkspace = workspaces.find((workspace) => workspace.kind === "root");
  if (rootWorkspace) {
    return rootWorkspace;
  }

  return [...workspaces].sort(compareLastActiveDesc)[0] ?? null;
}
