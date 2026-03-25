import type { FileViewerSessionState } from "@/features/explorer/lib/file-session";
import type { SurfaceLaunchRequest } from "@/features/workspaces/canvas/workspace-canvas-requests";
import type { WorkspaceCanvasTabViewState } from "@/features/workspaces/state/workspace-canvas-state";
import {
  canvasTabDomId,
  canvasTabPanelId,
} from "@/features/workspaces/canvas/workspace-canvas-ids";
import type { SurfaceLaunchAction } from "@/features/workspaces/surfaces/surface-launch-actions";
import type { WorkspacePaneTabSurfaceModel } from "@/features/workspaces/canvas/workspace-pane-models";
import { renderWorkspacePaneActiveSurface } from "@/features/workspaces/surfaces/workspace-surface-registry";
import { WorkspaceEmptyPaneState } from "@/features/workspaces/canvas/panes/workspace-empty-pane-state";

interface WorkspacePaneContentProps {
  activeTabKey: string | null;
  launchActions: SurfaceLaunchAction[];
  onFileSessionStateChange: (tabKey: string, state: FileViewerSessionState | null) => void;
  onLaunchSurface: (request: SurfaceLaunchRequest) => void;
  onOpenFile: (filePath: string) => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => void;
  paneDragInProgress: boolean;
  paneFocused: boolean;
  pendingLaunchActionKey: string | null;
  surfaceOpacity: number;
  tabSurfaces: WorkspacePaneTabSurfaceModel[];
}

export function WorkspacePaneContent({
  activeTabKey,
  launchActions,
  onFileSessionStateChange,
  onLaunchSurface,
  onOpenFile,
  onTabViewStateChange,
  paneDragInProgress: _paneDragInProgress,
  paneFocused,
  pendingLaunchActionKey,
  surfaceOpacity,
  tabSurfaces,
}: WorkspacePaneContentProps) {
  if (tabSurfaces.length === 0) {
    return (
      <WorkspaceEmptyPaneState
        actions={launchActions}
        onLaunchSurface={onLaunchSurface}
      />
    );
  }

  const context = {
    launchActions,
    onFileSessionStateChange,
    onLaunchSurface,
    onOpenFile,
    onTabViewStateChange,
    paneFocused,
    surfaceOpacity,
  };

  // Use absolute positioning so every tab gets real dimensions (preserving
  // scrollTop). visibility:hidden keeps the element in layout but invisible,
  // unlike display:none which resets scroll position.
  return (
    <div className="relative flex-1 min-h-0">
      {tabSurfaces.map(({ key, surface }) => {
        const isActive = key === activeTabKey;
        const panelId = canvasTabPanelId(key);
        const tabDomId = canvasTabDomId(key);

        return (
          <div
            key={key}
            id={panelId}
            aria-labelledby={tabDomId}
            aria-hidden={!isActive}
            className="absolute inset-0 flex flex-col"
            role="tabpanel"
            style={{
              visibility: isActive ? "visible" : "hidden",
              zIndex: isActive ? 1 : 0,
            }}
          >
            {renderWorkspacePaneActiveSurface(surface, context)}
          </div>
        );
      })}
    </div>
  );
}
