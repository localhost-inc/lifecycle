import type { WorkspaceCanvasTab } from "./workspace-canvas-tabs";

export interface CloseWorkspacePaneOperations {
  collapseEmptyPane: () => void;
  closeDocumentTab: (tabKey: string) => boolean;
  closeTerminalTab: (tabKey: string, terminalId: string) => Promise<boolean>;
}

export async function closeWorkspacePaneTabs(
  paneTabs: readonly WorkspaceCanvasTab[],
  operations: CloseWorkspacePaneOperations,
): Promise<boolean> {
  if (paneTabs.length === 0) {
    return true;
  }

  for (const tab of paneTabs) {
    const didClose =
      tab.kind === "terminal"
        ? await operations.closeTerminalTab(tab.key, tab.terminalId)
        : operations.closeDocumentTab(tab.key);
    if (!didClose) {
      return false;
    }
  }

  return true;
}
