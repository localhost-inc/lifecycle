import { WorkspacePaneTree } from "./workspace-pane-tree";
import {
  useWorkspaceCanvasController,
  type WorkspaceCanvasControllerInput,
} from "./workspace-canvas-controller";

export type WorkspaceCanvasProps = WorkspaceCanvasControllerInput;

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  const controller = useWorkspaceCanvasController(props);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {controller.error && (
        <div className="border-b border-[color-mix(in_srgb,var(--destructive)_24%,transparent)] bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-4 py-3 text-sm text-[var(--destructive)]">
          {controller.error}
        </div>
      )}

      <WorkspacePaneTree
        activePaneId={controller.activePaneId}
        creatingSelection={controller.creatingSelection}
        documents={controller.documents}
        fileSessionsByTabKey={controller.fileSessionsByTabKey}
        onCloseDocumentTab={controller.handleCloseDocumentTab}
        onClosePane={controller.handleClosePane}
        onCloseRuntimeTab={controller.handleCloseRuntimeTab}
        onCreateTerminal={controller.handleCreateTerminal}
        onFileSessionStateChange={controller.handleFileSessionStateChange}
        onLaunchSurface={controller.handleLaunchSurface}
        onMoveTabToPane={controller.handleMoveTabToPane}
        onOpenFile={controller.handleOpenFile}
        onRenameRuntimeTab={controller.handleRenameRuntimeTab}
        onSelectPane={controller.handleSelectPane}
        onSelectTab={controller.handleSelectTab}
        onReconcilePaneVisibleTabOrder={controller.handleReconcilePaneVisibleTabOrder}
        onSetSplitRatio={controller.handleSetSplitRatio}
        onSplitPane={controller.handleSplitPane}
        onTabViewStateChange={controller.handleActiveTabViewStateChange}
        paneCount={controller.paneCount}
        renderedActiveTabKeyByPaneId={controller.renderedActiveTabKeyByPaneId}
        rootPane={controller.rootPane}
        surfaceActions={controller.surfaceActions}
        terminals={controller.terminals}
        viewStateByTabKey={controller.viewStateByTabKey}
        visibleTabsByPaneId={controller.visibleTabsByPaneId}
        paneIdsWaitingForSelectedRuntimeTab={controller.paneIdsWaitingForSelectedRuntimeTab}
        workspaceId={controller.workspaceId}
      />
    </div>
  );
}
