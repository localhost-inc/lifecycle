/**
 * Workspace archive policy — decides what cleanup operations to perform.
 */

import type { WorkspaceRecord } from "@lifecycle/contracts";

export interface ArchiveInput {
  workspaceId: string;
  removeWorktree: boolean;
  attachmentPath: string | null;
}

export function computeArchiveInput(
  workspace: WorkspaceRecord,
  lifecycleRoot: string,
): ArchiveInput {
  const isRoot = workspace.checkout_type === "root";
  const hasLocalWorktree = workspace.host === "local" || workspace.host === "docker";

  return {
    workspaceId: workspace.id,
    removeWorktree: hasLocalWorktree && !isRoot,
    attachmentPath: `${lifecycleRoot}/attachments/${workspace.id}`,
  };
}
