import type { TerminalRecord } from "@lifecycle/contracts";
import type { FileViewerSessionState } from "@/features/explorer/lib/file-session";
import type { WorkspacePaneTabBarDragPreview } from "@/features/workspaces/canvas/tabs/workspace-pane-tab-bar";
import type {
  PreviewDocument,
  ChangesDiffDocument,
  CommitDiffDocument,
  FileViewerDocument,
  PullRequestDocument,
  WorkspacePaneNode,
  WorkspaceCanvasTabViewState,
  AgentTab,
} from "@/features/workspaces/state/workspace-canvas-state";
import type { SurfaceLaunchAction } from "@/features/workspaces/surfaces/surface-launch-actions";
import type {
  TerminalTab,
  WorkspaceCanvasTab,
} from "@/features/workspaces/canvas/workspace-canvas-tabs";

export interface WorkspacePaneTabModel {
  dirty: boolean;
  tab: WorkspaceCanvasTab;
}

export interface WorkspacePaneTabBarModel {
  activeTabKey: string | null;
  dragPreview: WorkspacePaneTabBarDragPreview | null;
  paneId: string;
  tabs: WorkspacePaneTabModel[];
}

export type WorkspacePaneActiveSurfaceModel =
  | {
      creatingSelection: "shell" | "claude" | "codex" | null;
      kind: "launcher";
    }
  | {
      kind: "waiting-terminal";
    }
  | {
      kind: "opening-terminal";
    }
  | {
      kind: "loading";
    }
  | {
      kind: "terminal";
      tab: TerminalTab;
      terminal: TerminalRecord;
    }
  | {
      document: ChangesDiffDocument;
      kind: "changes-diff";
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    }
  | {
      document: CommitDiffDocument;
      kind: "commit-diff";
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    }
  | {
      document: PreviewDocument;
      kind: "preview";
    }
  | {
      document: AgentTab;
      kind: "agent";
      workspaceId: string;
    }
  | {
      document: PullRequestDocument;
      kind: "pull-request";
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    }
  | {
      document: FileViewerDocument;
      kind: "file-viewer";
      sessionState: FileViewerSessionState | null;
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    };

export interface WorkspacePaneModel {
  activeSurface: WorkspacePaneActiveSurfaceModel;
  id: string;
  isActive: boolean;
  tabBar: WorkspacePaneTabBarModel;
}

export interface WorkspacePaneTreeActions {
  closeDocumentTab: (tabKey: string) => void;
  closeTerminalTab: (tabKey: string, terminalId: string) => Promise<void>;
  fileSessionStateChange: (tabKey: string, state: FileViewerSessionState | null) => void;
  launchSurface: (
    paneId: string,
    request:
      | { kind: "terminal"; launchType: "shell" }
      | { kind: "agent"; provider: "claude" | "codex" },
  ) => void;
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
  renameTerminalTab: (terminalId: string, label: string) => Promise<unknown> | unknown;
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
