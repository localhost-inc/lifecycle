import type { ReactNode } from "react";
import type { FileEditorSessionState } from "@/features/editor/lib/file-editor-session";
import type { SurfaceLaunchRequest } from "@/features/workspaces/canvas/workspace-canvas-requests";
import type { WorkspacePaneTabBarDragPreview } from "@/features/workspaces/canvas/tabs/workspace-pane-tab-bar";
import type {
  WorkspacePaneNode,
  WorkspaceCanvasTabViewState,
} from "@/features/workspaces/state/workspace-canvas-state";
import type { SurfaceLaunchAction } from "@/features/workspaces/surfaces/surface-launch-actions";
import type { WorkspacePaneActiveSurfaceModel } from "@/features/workspaces/surfaces/workspace-surface-registry";
import type { WorkspaceCanvasTab } from "@/features/workspaces/canvas/workspace-canvas-tabs";

export type { WorkspacePaneActiveSurfaceModel } from "@/features/workspaces/surfaces/workspace-surface-registry";

export interface WorkspacePaneTabModel {
  isDirty: boolean;
  isRunning: boolean;
  key: string;
  label: string;
  leading: ReactNode;
  needsAttention: boolean;
  title: string;
  tab: WorkspaceCanvasTab;
}

export interface WorkspacePaneTabBarModel {
  activeTabKey: string | null;
  dragPreview: WorkspacePaneTabBarDragPreview | null;
  paneId: string;
  tabs: WorkspacePaneTabModel[];
}

export interface WorkspacePaneTabSurfaceModel {
  key: string;
  surface: WorkspacePaneActiveSurfaceModel;
}

export interface WorkspacePaneModel {
  activeSurface: WorkspacePaneActiveSurfaceModel;
  id: string;
  isActive: boolean;
  tabBar: WorkspacePaneTabBarModel;
  tabSurfaces: WorkspacePaneTabSurfaceModel[];
}

export interface WorkspacePaneTreeActions {
  closeTab: (tabKey: string) => void;
  fileEditorSessionStateChange: (tabKey: string, state: FileEditorSessionState | null) => void;
  launchSurface: (paneId: string, request: SurfaceLaunchRequest) => void;
  moveTabToPane: (
    key: string,
    sourcePaneId: string,
    targetPaneId: string,
    targetKey?: string,
    placement?: "after" | "before",
    splitDirection?: "column" | "row",
    splitPlacement?: "after" | "before",
    splitRatio?: number,
  ) => void;
  openFile: (filePath: string) => void;
  reconcilePaneVisibleTabOrder: (paneId: string, keys: string[]) => void;
  resetAllSplitRatios: () => void;
  selectPane: (paneId: string) => void;
  selectTab: (paneId: string, key: string) => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
  splitPane: (paneId: string, direction: "column" | "row") => void;
  tabViewStateChange: (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => void;
  toggleZoom: () => void;
}

export interface WorkspacePaneTreeModel {
  dimInactivePanes: boolean;
  inactivePaneOpacity: number;
  paneCount: number;
  panesById: Record<string, WorkspacePaneModel>;
  rootPane: WorkspacePaneNode;
  surfaceActions: SurfaceLaunchAction[];
  zoomedTabKey: string | null;
}
