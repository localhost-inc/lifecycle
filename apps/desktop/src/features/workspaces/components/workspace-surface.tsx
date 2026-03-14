import { WorkspaceSurfacePaneTree } from "./workspace-surface-pane-tree";
import {
  useWorkspaceSurfaceController,
  type WorkspaceSurfaceControllerInput,
} from "./workspace-surface-controller";

export type WorkspaceSurfaceProps = WorkspaceSurfaceControllerInput;

export function WorkspaceSurface(props: WorkspaceSurfaceProps) {
  const controller = useWorkspaceSurfaceController(props);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {controller.error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {controller.error}
        </div>
      )}

      <WorkspaceSurfacePaneTree
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
