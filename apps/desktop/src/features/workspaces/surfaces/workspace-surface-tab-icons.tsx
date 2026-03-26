import type { ReactNode } from "react";
import {
  isAgentTab,
  isChangesDiffTab,
  isCommitDiffTab,
  isFileEditorTab,
  isPreviewTab,
  isPullRequestTab,
  type WorkspaceCanvasTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";

export function workspaceSurfaceTabIconName(tab: WorkspaceCanvasTab): string {
  if (isFileEditorTab(tab)) {
    return tab.extension === "pen" ? "file-editor-pencil" : "file-editor";
  }

  if (isPreviewTab(tab)) {
    return "preview";
  }

  if (isAgentTab(tab)) {
    return tab.provider;
  }

  if (isCommitDiffTab(tab)) {
    return "commit-diff";
  }

  if (isPullRequestTab(tab)) {
    return "pull-request";
  }

  if (isChangesDiffTab(tab)) {
    return "changes-diff";
  }

  return "workspace-tab";
}

export function WorkspaceSurfaceBubble({
  children,
  tab,
}: {
  children: ReactNode;
  tab: WorkspaceCanvasTab;
}) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center text-current"
      data-surface-tab-icon={workspaceSurfaceTabIconName(tab)}
    >
      {children}
    </span>
  );
}
