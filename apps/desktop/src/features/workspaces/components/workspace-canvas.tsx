import { WorkspacePaneTree } from "@/features/workspaces/components/workspace-pane-tree";
import {
  useWorkspaceCanvasController,
  type WorkspaceCanvasControllerInput,
} from "@/features/workspaces/components/workspace-canvas-controller";

export function WorkspaceCanvas(controllerInput: WorkspaceCanvasControllerInput) {
  const controller = useWorkspaceCanvasController(controllerInput);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {controller.error && (
        <div className="border-b border-[var(--destructive)]/24 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
          {controller.error}
        </div>
      )}

      <WorkspacePaneTree
        activePaneId={controller.activePaneId}
        creatingSelection={controller.creatingSelection}
        dimInactivePanes={controller.dimInactivePanes}
        documents={controller.documents}
        fileSessionsByTabKey={controller.fileSessionsByTabKey}
        inactivePaneOpacity={controller.inactivePaneOpacity}
        onCloseDocumentTab={controller.handleCloseDocumentTab}
        onCloseTerminalTab={controller.handleCloseTerminalTab}
        onCreateTerminal={controller.handleCreateTerminal}
        onFileSessionStateChange={controller.handleFileSessionStateChange}
        onLaunchSurface={controller.handleLaunchSurface}
        onMoveTabToPane={controller.handleMoveTabToPane}
        onOpenFile={controller.handleOpenFile}
        onRenameTerminalTab={controller.handleRenameTerminalTab}
        onSelectPane={controller.handleSelectPane}
        onSelectTab={controller.handleSelectTab}
        onReconcilePaneVisibleTabOrder={controller.handleReconcilePaneVisibleTabOrder}
        onResetAllSplitRatios={controller.handleResetAllSplitRatios}
        onSetSplitRatio={controller.handleSetSplitRatio}
        onSplitPane={controller.handleSplitPane}
        onTabViewStateChange={controller.handleActiveTabViewStateChange}
        onToggleZoom={controller.handleToggleZoom}
        paneCount={controller.paneCount}
        renderedActiveTabKeyByPaneId={controller.renderedActiveTabKeyByPaneId}
        rootPane={controller.rootPane}
        surfaceActions={controller.surfaceActions}
        terminals={controller.terminals}
        viewStateByTabKey={controller.viewStateByTabKey}
        visibleTabsByPaneId={controller.visibleTabsByPaneId}
        paneIdsWaitingForSelectedTerminalTab={controller.paneIdsWaitingForSelectedTerminalTab}
        workspaceId={controller.workspaceId}
        zoomedTabKey={controller.zoomedTabKey}
      />
    </div>
  );
}
