import type { ReactNode } from "react";
import { EmptyState } from "@lifecycle/ui";
import { PanelsTopLeft } from "lucide-react";
import type {
  OpenSurfaceInput,
  SurfaceLaunchRequest,
  WorkspaceSurfaceKind,
} from "@/features/workspaces/canvas/workspace-canvas-requests";
import type { FileViewerSessionState } from "@/features/explorer/lib/file-session";
import { agentSurfaceDefinition } from "@/features/workspaces/surfaces/agent-surface-definition";
import { changesDiffSurfaceDefinition } from "@/features/workspaces/surfaces/changes-diff-surface-definition";
import { commitDiffSurfaceDefinition } from "@/features/workspaces/surfaces/commit-diff-surface-definition";
import { fileViewerSurfaceDefinition } from "@/features/workspaces/surfaces/file-viewer-surface-definition";
import { previewSurfaceDefinition } from "@/features/workspaces/surfaces/preview-surface-definition";
import { pullRequestSurfaceDefinition } from "@/features/workspaces/surfaces/pull-request-surface-definition";
import {
  getOptionalString,
  isRecord,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import type { WorkspaceCanvasTab } from "@/features/workspaces/surfaces/workspace-surface-tab-records";
import { WorkspaceEmptyPaneState } from "@/features/workspaces/canvas/panes/workspace-empty-pane-state";
import {
  defaultWorkspaceSurfaceNormalization,
  defaultWorkspaceSurfaceTabStatus,
  type WorkspacePaneActiveSurfaceModel,
  type WorkspacePaneSurfaceRenderContext,
  type WorkspaceSurfaceActiveModelContext,
  type WorkspaceSurfaceLaunchActionsContext,
  type WorkspaceSurfaceLaunchExecutionContext,
  type WorkspaceSurfaceRegistry,
  type WorkspaceSurfaceTabNormalizationContext,
  type WorkspaceSurfaceTabPresentation,
  type WorkspaceSurfaceTabStatus,
  type WorkspaceSurfaceTabStatusContext,
} from "@/features/workspaces/surfaces/workspace-surface-types";
import type { WorkspaceCanvasTabViewState } from "@/features/workspaces/state/workspace-canvas-state";

const workspaceSurfaceRegistry: WorkspaceSurfaceRegistry = {
  agent: agentSurfaceDefinition,
  "changes-diff": changesDiffSurfaceDefinition,
  "commit-diff": commitDiffSurfaceDefinition,
  "file-viewer": fileViewerSurfaceDefinition,
  preview: previewSurfaceDefinition,
  "pull-request": pullRequestSurfaceDefinition,
};

function getWorkspaceSurfaceDefinition(kind: WorkspaceSurfaceKind) {
  return workspaceSurfaceRegistry[kind];
}

export type { WorkspacePaneActiveSurfaceModel } from "@/features/workspaces/surfaces/workspace-surface-types";

export function buildWorkspaceSurfaceTabPresentation(
  tab: WorkspaceCanvasTab,
  status?: WorkspaceSurfaceTabStatus,
): WorkspaceSurfaceTabPresentation {
  return getWorkspaceSurfaceDefinition(tab.kind).buildTabPresentation(tab as never, status);
}

export function createWorkspaceSurfaceTab(
  input: OpenSurfaceInput,
  existingTab?: WorkspaceCanvasTab | null,
): WorkspaceCanvasTab {
  return getWorkspaceSurfaceDefinition(input.surface).createTab(
    input.options as never,
    existingTab as never,
  );
}

export function getWorkspaceSurfaceTabKey(input: OpenSurfaceInput): string {
  return getWorkspaceSurfaceDefinition(input.surface).getTabKey(input.options as never);
}

export function parseWorkspaceSurfaceTab(value: unknown): WorkspaceCanvasTab | null {
  if (!isRecord(value)) {
    return null;
  }

  const persistedKind = getOptionalString(value, "kind");
  if (!persistedKind || !(persistedKind in workspaceSurfaceRegistry)) {
    return null;
  }

  return workspaceSurfaceRegistry[persistedKind as WorkspaceSurfaceKind].parsePersistedTab(
    value as never,
  );
}

export function serializeWorkspaceSurfaceTab(tab: WorkspaceCanvasTab): Record<string, unknown> {
  return getWorkspaceSurfaceDefinition(tab.kind).serializeTab(tab as never);
}

export function normalizeWorkspaceSurfaceTab(
  tab: WorkspaceCanvasTab,
  context: WorkspaceSurfaceTabNormalizationContext,
): WorkspaceCanvasTab {
  const definition = getWorkspaceSurfaceDefinition(tab.kind);
  return definition.normalizeTab
    ? definition.normalizeTab(tab as never, context)
    : defaultWorkspaceSurfaceNormalization(tab);
}

export function resolveWorkspaceSurfaceTabStatus(
  tab: WorkspaceCanvasTab,
  context: WorkspaceSurfaceTabStatusContext,
): WorkspaceSurfaceTabStatus {
  const definition = getWorkspaceSurfaceDefinition(tab.kind);
  return definition.resolveTabStatus
    ? definition.resolveTabStatus(tab as never, context)
    : defaultWorkspaceSurfaceTabStatus();
}

export function listWorkspaceSurfaceLaunchActions(context: WorkspaceSurfaceLaunchActionsContext) {
  return Object.values(workspaceSurfaceRegistry).flatMap((definition) =>
    definition.listLaunchActions ? definition.listLaunchActions(context) : [],
  );
}

export async function launchWorkspaceSurface(
  request: SurfaceLaunchRequest,
  context: WorkspaceSurfaceLaunchExecutionContext,
): Promise<void> {
  const definition = getWorkspaceSurfaceDefinition(request.surface);
  if (definition.launchSurface) {
    await definition.launchSurface(request as never, context);
  }
}

export function resolveWorkspaceSurfaceModelForTab(
  tab: WorkspaceCanvasTab,
  context: WorkspaceSurfaceActiveModelContext,
): WorkspacePaneActiveSurfaceModel {
  return getWorkspaceSurfaceDefinition(tab.kind).resolveActiveSurface(tab as never, context);
}

export function resolveWorkspacePaneActiveSurfaceModel(input: {
  activeTabKey: string | null;
  fileSessionsByTabKey: Record<string, FileViewerSessionState>;
  pendingLaunchActionKey: string | null;
  viewStateByTabKey: Record<string, WorkspaceCanvasTabViewState>;
  visibleTabs: readonly WorkspaceCanvasTab[];
  workspaceId: string;
}): WorkspacePaneActiveSurfaceModel {
  if (input.visibleTabs.length === 0) {
    return { kind: "launcher", pendingLaunchActionKey: input.pendingLaunchActionKey };
  }

  if (!input.activeTabKey) {
    return { kind: "loading" };
  }

  const activeTab = input.visibleTabs.find((tab) => tab.key === input.activeTabKey) ?? null;
  if (!activeTab) {
    return { kind: "loading" };
  }

  const context: WorkspaceSurfaceActiveModelContext = {
    fileSessionsByTabKey: input.fileSessionsByTabKey as never,
    viewStateByTabKey: input.viewStateByTabKey,
    workspaceId: input.workspaceId,
  };

  return getWorkspaceSurfaceDefinition(activeTab.kind).resolveActiveSurface(
    activeTab as never,
    context,
  );
}

export function renderWorkspacePaneActiveSurface(
  activeSurface: WorkspacePaneActiveSurfaceModel,
  context: WorkspacePaneSurfaceRenderContext,
): ReactNode {
  if (activeSurface.kind === "launcher") {
    return (
      <WorkspaceEmptyPaneState
        actions={context.launchActions}
        onLaunchSurface={context.onLaunchSurface}
      />
    );
  }

  if (activeSurface.kind === "loading") {
    return (
      <EmptyState
        description="Lifecycle is provisioning the selected workspace tab."
        icon={<PanelsTopLeft />}
        title="Loading tab..."
      />
    );
  }

  return getWorkspaceSurfaceDefinition(activeSurface.kind).renderActiveSurface(
    activeSurface as never,
    context,
  );
}

export function areWorkspacePaneActiveSurfacesEqual(
  previous: WorkspacePaneActiveSurfaceModel,
  next: WorkspacePaneActiveSurfaceModel,
): boolean {
  if (previous.kind !== next.kind) {
    return false;
  }

  if (previous.kind === "launcher") {
    const nextLauncher = next as Extract<WorkspacePaneActiveSurfaceModel, { kind: "launcher" }>;
    return previous.pendingLaunchActionKey === nextLauncher.pendingLaunchActionKey;
  }

  if (previous.kind === "loading") {
    return true;
  }

  return getWorkspaceSurfaceDefinition(previous.kind).areActiveSurfacesEqual(
    previous as never,
    next as never,
  );
}
