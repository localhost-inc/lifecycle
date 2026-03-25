import type { WorkspaceCanvasTab } from "@/features/workspaces/canvas/workspace-canvas-tabs";

export interface CloseWorkspacePaneOperations {
  collapseEmptyPane: () => void;
  closeTab: (tabKey: string) => boolean;
}

export async function closeWorkspacePaneTabs(
  paneTabs: readonly WorkspaceCanvasTab[],
  operations: CloseWorkspacePaneOperations,
): Promise<boolean> {
  if (paneTabs.length === 0) {
    return true;
  }

  for (const tab of paneTabs) {
    const didClose = operations.closeTab(tab.key);
    if (!didClose) {
      return false;
    }
  }

  return true;
}
