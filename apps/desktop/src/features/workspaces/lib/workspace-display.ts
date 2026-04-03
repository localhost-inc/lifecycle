import type { WorkspaceRecord } from "@lifecycle/contracts";

type WorkspaceDisplayRecord = Pick<WorkspaceRecord, "checkout_type" | "name" | "source_ref">;

export function isRootWorkspace(workspace: Pick<WorkspaceRecord, "checkout_type">): boolean {
  return workspace.checkout_type === "root";
}

export function canInlineRenameWorkspace(
  workspace: Pick<WorkspaceRecord, "checkout_type">,
): boolean {
  return !isRootWorkspace(workspace);
}

export function getWorkspaceDisplayName(
  workspace: WorkspaceDisplayRecord,
  activeBranchName?: string | null,
): string {
  if (!isRootWorkspace(workspace)) {
    return workspace.name;
  }

  const normalizedActiveBranchName = activeBranchName?.trim();
  if (normalizedActiveBranchName) {
    return normalizedActiveBranchName;
  }

  const normalizedSourceRef = workspace.source_ref.trim();
  if (normalizedSourceRef) {
    return normalizedSourceRef;
  }

  const normalizedName = workspace.name.trim();
  return normalizedName || "root";
}
