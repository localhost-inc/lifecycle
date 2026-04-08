/**
 * Workspace rename policy — name normalization, branch rename disposition.
 */

import type { WorkspaceRecord } from "@lifecycle/contracts";
import { isLifecycleWorktreeBranch, workspaceBranchName } from "./workspace-names";

const MAX_WORKSPACE_NAME_LENGTH = 64;

export function normalizeWorkspaceName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Workspace name cannot be empty.");
  }
  const normalized = trimmed.replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error("Workspace name cannot be empty.");
  }
  return normalized.slice(0, MAX_WORKSPACE_NAME_LENGTH);
}

export type RenameDisposition = { action: "rename" } | { action: "skip"; reason: string };

export function computeRenameDispositionSync(
  workspace: WorkspaceRecord,
  nextSourceRef: string,
): RenameDisposition | "check_upstream" {
  if (workspace.checkout_type === "root") {
    return { action: "skip", reason: "root workspaces do not rename the project branch" };
  }
  if (workspace.source_ref === nextSourceRef) {
    return { action: "skip", reason: "branch already matches identity" };
  }
  if (!workspace.workspace_root) {
    return { action: "skip", reason: "workspace has no worktree path" };
  }
  if (!isLifecycleWorktreeBranch(workspace.source_ref, workspace.id)) {
    return { action: "skip", reason: "current branch is not a lifecycle worktree branch" };
  }
  return "check_upstream";
}

export interface RenameInput {
  workspaceId: string;
  name: string;
  sourceRef: string;
  renameBranch: boolean;
  moveWorktree: boolean;
}

export function computeRenameInput(
  workspace: WorkspaceRecord,
  rawName: string,
  branchHasUpstream: boolean,
  currentWorktreeBranch: string | null,
): RenameInput {
  const name = normalizeWorkspaceName(rawName);
  const nextSourceRef = workspaceBranchName(name, workspace.id);

  const isRoot = workspace.checkout_type === "root";
  const nameChanged = workspace.name !== name;
  const moveWorktree = !isRoot && nameChanged && workspace.workspace_root != null;

  let renameBranch = false;
  const syncDisposition = computeRenameDispositionSync(workspace, nextSourceRef);

  if (syncDisposition === "check_upstream") {
    if (currentWorktreeBranch !== workspace.source_ref) {
      renameBranch = false;
    } else if (branchHasUpstream) {
      renameBranch = false;
    } else {
      renameBranch = true;
    }
  }

  const sourceRef = renameBranch ? nextSourceRef : workspace.source_ref;
  return {
    workspaceId: workspace.id,
    name,
    sourceRef,
    renameBranch,
    moveWorktree,
  };
}
