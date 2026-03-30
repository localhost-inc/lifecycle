import { memo, useEffect, useMemo } from "react";
import type { FileEditorSessionState } from "@/features/editor/lib/file-editor-session";
import type { SurfaceLaunchRequest } from "@/features/workspaces/canvas/workspace-canvas-requests";
import type { WorkspaceCanvasTabViewState } from "@/features/workspaces/state/workspace-canvas-state";
import {
  canvasTabDomId,
  canvasTabPanelId,
} from "@/features/workspaces/canvas/workspace-canvas-ids";
import type { SurfaceLaunchAction } from "@/features/workspaces/surfaces/surface-launch-actions";
import type { WorkspacePaneTabSurfaceModel } from "@/features/workspaces/canvas/workspace-pane-models";
import {
  completeWorkspacePaneTabSwitchStage,
  useWorkspacePaneRenderCount,
} from "@/features/workspaces/canvas/workspace-pane-performance";
import {
  areWorkspacePaneActiveSurfacesEqual,
  renderWorkspacePaneActiveSurface,
} from "@/features/workspaces/surfaces/workspace-surface-registry";
import { WorkspaceEmptyPaneState } from "@/features/workspaces/canvas/panes/workspace-empty-pane-state";

interface WorkspacePaneContentProps {
  activeTabKey: string | null;
  launchActions: SurfaceLaunchAction[];
  onFileEditorSessionStateChange: (tabKey: string, state: FileEditorSessionState | null) => void;
  onLaunchSurface: (request: SurfaceLaunchRequest) => void;
  onOpenFile: (filePath: string) => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => void;
  paneId: string;
  paneDragInProgress: boolean;
  paneFocused: boolean;
  pendingLaunchActionKey: string | null;
  surfaceOpacity: number;
  tabSurfaces: WorkspacePaneTabSurfaceModel[];
}

interface WorkspaceMountedSurfaceProps {
  isActive: boolean;
  launchActions: SurfaceLaunchAction[];
  onFileEditorSessionStateChange: (tabKey: string, state: FileEditorSessionState | null) => void;
  onLaunchSurface: (request: SurfaceLaunchRequest) => void;
  onOpenFile: (filePath: string) => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => void;
  paneFocused: boolean;
  panelId: string;
  surface: WorkspacePaneTabSurfaceModel["surface"];
  surfaceKey: string;
  surfaceOpacity: number;
  tabDomId: string;
}

export function areWorkspaceMountedSurfacePropsEqual(
  previous: WorkspaceMountedSurfaceProps,
  next: WorkspaceMountedSurfaceProps,
): boolean {
  return (
    previous.isActive === next.isActive &&
    previous.launchActions === next.launchActions &&
    previous.onFileEditorSessionStateChange === next.onFileEditorSessionStateChange &&
    previous.onLaunchSurface === next.onLaunchSurface &&
    previous.onOpenFile === next.onOpenFile &&
    previous.onTabViewStateChange === next.onTabViewStateChange &&
    previous.paneFocused === next.paneFocused &&
    previous.panelId === next.panelId &&
    previous.surfaceKey === next.surfaceKey &&
    previous.surfaceOpacity === next.surfaceOpacity &&
    previous.tabDomId === next.tabDomId &&
    areWorkspacePaneActiveSurfacesEqual(previous.surface, next.surface)
  );
}

const WorkspaceMountedSurface = memo(function WorkspaceMountedSurface({
  isActive,
  launchActions,
  onFileEditorSessionStateChange,
  onLaunchSurface,
  onOpenFile,
  onTabViewStateChange,
  paneFocused,
  panelId,
  surface,
  surfaceKey,
  surfaceOpacity,
  tabDomId,
}: WorkspaceMountedSurfaceProps) {
  useWorkspacePaneRenderCount("WorkspaceMountedSurface", surfaceKey);

  const context = useMemo(
    () => ({
      launchActions,
      onFileEditorSessionStateChange,
      onLaunchSurface,
      onOpenFile,
      onTabViewStateChange,
      paneFocused: paneFocused && isActive,
      surfaceOpacity,
    }),
    [
      isActive,
      launchActions,
      onFileEditorSessionStateChange,
      onLaunchSurface,
      onOpenFile,
      onTabViewStateChange,
      paneFocused,
      surfaceOpacity,
    ],
  );
  const renderedSurface = useMemo(
    () => renderWorkspacePaneActiveSurface(surface, context),
    [context, surface],
  );

  return (
    <div
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
      {renderedSurface}
    </div>
  );
}, areWorkspaceMountedSurfacePropsEqual);

export function WorkspacePaneContent({
  activeTabKey,
  launchActions,
  onFileEditorSessionStateChange,
  onLaunchSurface,
  onOpenFile,
  onTabViewStateChange,
  paneId,
  paneDragInProgress: _paneDragInProgress,
  paneFocused,
  pendingLaunchActionKey: _pendingLaunchActionKey,
  surfaceOpacity,
  tabSurfaces,
}: WorkspacePaneContentProps) {
  useWorkspacePaneRenderCount("WorkspacePaneContent", paneId);

  useEffect(() => {
    if (!paneFocused || !activeTabKey) {
      return;
    }

    completeWorkspacePaneTabSwitchStage("active-pane-content-render", {
      paneId,
      tabKey: activeTabKey,
    });

    const frameId = window.requestAnimationFrame(() => {
      completeWorkspacePaneTabSwitchStage("dispatch->paint", {
        clearPending: true,
        paneId,
        tabKey: activeTabKey,
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeTabKey, paneFocused, paneId, tabSurfaces]);

  if (tabSurfaces.length === 0) {
    return <WorkspaceEmptyPaneState actions={launchActions} onLaunchSurface={onLaunchSurface} />;
  }

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
          <WorkspaceMountedSurface
            key={key}
            isActive={isActive}
            launchActions={launchActions}
            onFileEditorSessionStateChange={onFileEditorSessionStateChange}
            onLaunchSurface={onLaunchSurface}
            onOpenFile={onOpenFile}
            onTabViewStateChange={onTabViewStateChange}
            paneFocused={paneFocused}
            panelId={panelId}
            surface={surface}
            surfaceKey={key}
            surfaceOpacity={surfaceOpacity}
            tabDomId={tabDomId}
          />
        );
      })}
    </div>
  );
}
