import type { ReactNode } from "react";
import type { AgentOrchestrator } from "@lifecycle/agents";
import type {
  AgentSurfaceOptions,
  ChangesDiffSurfaceOptions,
  CommitDiffSurfaceOptions,
  FileSurfaceOptions,
  OpenSurfaceInput,
  PreviewSurfaceOptions,
  PullRequestSurfaceOptions,
  SurfaceLaunchRequest,
  WorkspaceSurfaceKind,
} from "@/features/workspaces/canvas/workspace-canvas-requests";
import type { FileViewerSessionState } from "@/features/explorer/lib/file-session";
import type { SurfaceLaunchAction } from "@/features/workspaces/surfaces/surface-launch-actions";
import type {
  AgentTab,
  ChangesDiffTab,
  CommitDiffTab,
  FileViewerTab,
  PreviewTab,
  PullRequestTab,
  WorkspaceCanvasTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";
import type { WorkspaceCanvasTabViewState } from "@/features/workspaces/state/workspace-canvas-state";

export interface WorkspaceSurfaceTabStatus {
  isDirty?: boolean;
  isRunning?: boolean;
  needsAttention?: boolean;
}

export interface WorkspaceSurfaceTabNormalizationContext {
  agentSessionTitleBySessionId: ReadonlyMap<string, string>;
}

export interface WorkspaceSurfaceTabStatusContext {
  fileSessionsByTabKey: Record<string, FileViewerSessionState>;
  isAgentSessionResponseReady: (sessionId: string) => boolean;
  isAgentSessionRunning: (sessionId: string) => boolean;
}

export interface WorkspaceSurfaceTabPresentation {
  leading: ReactNode;
  title: string;
}

export interface WorkspaceSurfaceOptionsByKind {
  agent: AgentSurfaceOptions;
  "changes-diff": ChangesDiffSurfaceOptions;
  "commit-diff": CommitDiffSurfaceOptions;
  "file-viewer": FileSurfaceOptions;
  preview: PreviewSurfaceOptions;
  "pull-request": PullRequestSurfaceOptions;
}

export interface WorkspaceSurfaceTabByKind {
  agent: AgentTab;
  "changes-diff": ChangesDiffTab;
  "commit-diff": CommitDiffTab;
  "file-viewer": FileViewerTab;
  preview: PreviewTab;
  "pull-request": PullRequestTab;
}

export type WorkspacePaneActiveSurfaceModel =
  | {
      kind: "launcher";
      pendingLaunchActionKey: string | null;
    }
  | {
      kind: "loading";
    }
  | {
      kind: "changes-diff";
      tab: ChangesDiffTab;
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    }
  | {
      kind: "commit-diff";
      tab: CommitDiffTab;
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    }
  | {
      kind: "preview";
      tab: PreviewTab;
    }
  | {
      kind: "agent";
      tab: AgentTab;
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    }
  | {
      kind: "pull-request";
      tab: PullRequestTab;
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    }
  | {
      kind: "file-viewer";
      sessionState: FileViewerSessionState | null;
      tab: FileViewerTab;
      viewState: WorkspaceCanvasTabViewState | null;
      workspaceId: string;
    };

export type WorkspaceSurfaceActiveModelByKind = {
  [Kind in WorkspaceSurfaceKind]: Extract<WorkspacePaneActiveSurfaceModel, { kind: Kind }>;
};

export interface WorkspacePaneSurfaceRenderContext {
  launchActions: SurfaceLaunchAction[];
  onFileSessionStateChange: (tabKey: string, state: FileViewerSessionState | null) => void;
  onLaunchSurface: (request: SurfaceLaunchRequest) => void;
  onOpenFile: (filePath: string) => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => void;
  paneFocused: boolean;
  surfaceOpacity: number;
}

export interface WorkspaceSurfaceLaunchActionsContext {
  pendingLaunchActionKey: string | null;
}

export interface WorkspaceSurfaceLaunchExecutionContext {
  agentOrchestrator: AgentOrchestrator;
  openSurface: (input: OpenSurfaceInput) => void;
  setLaunchError: (message: string | null) => void;
  setPendingLaunchActionKey: (key: string | null) => void;
  workspaceId: string;
}

export interface WorkspaceSurfaceActiveModelContext {
  fileSessionsByTabKey: Record<string, FileViewerSessionState>;
  viewStateByTabKey: Record<string, WorkspaceCanvasTabViewState>;
  workspaceId: string;
}

export interface WorkspaceSurfaceDefinition<Kind extends WorkspaceSurfaceKind> {
  areActiveSurfacesEqual: (
    previous: WorkspaceSurfaceActiveModelByKind[Kind],
    next: WorkspaceSurfaceActiveModelByKind[Kind],
  ) => boolean;
  buildTabPresentation: (
    tab: WorkspaceSurfaceTabByKind[Kind],
    status?: WorkspaceSurfaceTabStatus,
  ) => WorkspaceSurfaceTabPresentation;
  createTab: (
    options: WorkspaceSurfaceOptionsByKind[Kind],
    existingTab?: WorkspaceSurfaceTabByKind[Kind] | null,
  ) => WorkspaceSurfaceTabByKind[Kind];
  getTabKey: (options: WorkspaceSurfaceOptionsByKind[Kind]) => string;
  parsePersistedTab: (value: unknown) => WorkspaceSurfaceTabByKind[Kind] | null;
  renderActiveSurface: (
    activeSurface: WorkspaceSurfaceActiveModelByKind[Kind],
    context: WorkspacePaneSurfaceRenderContext,
  ) => ReactNode;
  resolveActiveSurface: (
    tab: WorkspaceSurfaceTabByKind[Kind],
    context: WorkspaceSurfaceActiveModelContext,
  ) => WorkspaceSurfaceActiveModelByKind[Kind];
  listLaunchActions?: (context: WorkspaceSurfaceLaunchActionsContext) => SurfaceLaunchAction[];
  launchSurface?: (
    request: Extract<SurfaceLaunchRequest, { surface: Kind }>,
    context: WorkspaceSurfaceLaunchExecutionContext,
  ) => Promise<void>;
  normalizeTab?: (
    tab: WorkspaceSurfaceTabByKind[Kind],
    context: WorkspaceSurfaceTabNormalizationContext,
  ) => WorkspaceSurfaceTabByKind[Kind];
  resolveTabStatus?: (
    tab: WorkspaceSurfaceTabByKind[Kind],
    context: WorkspaceSurfaceTabStatusContext,
  ) => WorkspaceSurfaceTabStatus;
  serializeTab: (tab: WorkspaceSurfaceTabByKind[Kind]) => Record<string, unknown>;
}

export type WorkspaceSurfaceRegistry = {
  [Kind in WorkspaceSurfaceKind]: WorkspaceSurfaceDefinition<Kind>;
};

export function areWorkspaceCanvasViewStatesEqual(
  previous: WorkspaceCanvasTabViewState | null | undefined,
  next: WorkspaceCanvasTabViewState | null | undefined,
): boolean {
  if (previous === next) {
    return true;
  }

  return (
    previous?.fileMode === next?.fileMode &&
    previous?.scrollTop === next?.scrollTop &&
    previous?.stickToBottom === next?.stickToBottom
  );
}

export function areFileViewerSessionStatesEqual(
  previous: FileViewerSessionState | null | undefined,
  next: FileViewerSessionState | null | undefined,
): boolean {
  if (previous === next) {
    return true;
  }

  return (
    previous?.conflictDiskContent === next?.conflictDiskContent &&
    previous?.draftContent === next?.draftContent &&
    previous?.savedContent === next?.savedContent
  );
}

export function defaultWorkspaceSurfaceTabStatus(): WorkspaceSurfaceTabStatus {
  return {
    isDirty: false,
    isRunning: false,
    needsAttention: false,
  };
}

export function defaultWorkspaceSurfaceNormalization(tab: WorkspaceCanvasTab): WorkspaceCanvasTab {
  return tab;
}
