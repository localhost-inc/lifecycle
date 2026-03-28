import type { WorkspaceRecord } from "@lifecycle/contracts";
import { shortWorkspaceId, slugifyWorkspaceName } from "./workspace-names";

function slugifySourceRef(sourceRef: string): string {
  const trimmed = sourceRef.trim();
  if (!trimmed || trimmed === "HEAD") {
    return "workspace";
  }

  const normalized = trimmed
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/origin\//, "")
    .replace(/^origin\//, "");

  return slugifyWorkspaceName(normalized);
}

function lifecycleWorktreeBranchSlug(sourceRef: string, shortId: string): string | null {
  const branchSlug = sourceRef.trim().replace(/^lifecycle\//, "");
  if (!branchSlug.endsWith(`-${shortId}`)) {
    return null;
  }

  const candidate = slugifyWorkspaceName(branchSlug.slice(0, -`-${shortId}`.length));
  return candidate === "workspace" ? null : candidate;
}

export function workspaceHostLabel(
  workspace: Pick<WorkspaceRecord, "id" | "checkout_type" | "name" | "source_ref">,
): string {
  const shortId = shortWorkspaceId(workspace.id);
  const base = (() => {
    if (workspace.checkout_type === "worktree") {
      const worktreeSlug = lifecycleWorktreeBranchSlug(workspace.source_ref, shortId);
      if (worktreeSlug) {
        return worktreeSlug;
      }
    }

    const sourceSlug = slugifySourceRef(workspace.source_ref);
    if (sourceSlug !== "workspace") {
      return sourceSlug;
    }

    return slugifyWorkspaceName(workspace.name);
  })();

  return base.endsWith(`-${shortId}`) ? base : `${base}-${shortId}`;
}
