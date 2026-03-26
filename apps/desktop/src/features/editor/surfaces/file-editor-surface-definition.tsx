import { FileText, PenTool } from "lucide-react";
import { FileEditorSurface } from "@/features/editor/components/file-editor-surface";
import { isFileEditorDirty } from "@/features/editor/lib/file-editor-session";
import { WorkspaceSurfaceBubble } from "@/features/workspaces/surfaces/workspace-surface-tab-icons";
import {
  getOptionalString,
  isRecord,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import {
  areFileEditorSessionStatesEqual,
  areWorkspaceCanvasViewStatesEqual,
  type WorkspaceSurfaceDefinition,
} from "@/features/workspaces/surfaces/workspace-surface-types";
import {
  createFileEditorTab,
  fileEditorTabKey,
  type FileEditorTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";

export const fileEditorSurfaceDefinition: WorkspaceSurfaceDefinition<"file-editor"> = {
  areActiveSurfacesEqual: (previous, next) =>
    previous.tab === next.tab &&
    previous.workspaceId === next.workspaceId &&
    areWorkspaceCanvasViewStatesEqual(previous.viewState, next.viewState) &&
    areFileEditorSessionStatesEqual(previous.sessionState, next.sessionState),
  buildTabPresentation: (tab) => ({
    leading: (
      <WorkspaceSurfaceBubble tab={tab}>
        {tab.extension === "pen" ? (
          <PenTool className="h-3.5 w-3.5" strokeWidth={1.8} />
        ) : (
          <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
        )}
      </WorkspaceSurfaceBubble>
    ),
    title: tab.filePath,
  }),
  createTab: (options) => createFileEditorTab(options.filePath),
  getTabKey: (options) => fileEditorTabKey(options.filePath),
  parsePersistedTab: parsePersistedFileEditorTab,
  renderActiveSurface: (activeSurface, context) => (
    <FileEditorSurface
      filePath={activeSurface.tab.filePath}
      initialMode={activeSurface.viewState?.fileMode}
      initialScrollTop={activeSurface.viewState?.scrollTop ?? 0}
      onModeChange={(fileMode) => {
        context.onTabViewStateChange(activeSurface.tab.key, {
          ...(activeSurface.viewState?.scrollTop && activeSurface.viewState.scrollTop > 0
            ? { scrollTop: activeSurface.viewState.scrollTop }
            : {}),
          fileMode,
        });
      }}
      onScrollTopChange={(scrollTop: number) => {
        context.onTabViewStateChange(
          activeSurface.tab.key,
          scrollTop > 0 || activeSurface.viewState?.fileMode
            ? {
                ...(activeSurface.viewState?.fileMode
                  ? { fileMode: activeSurface.viewState.fileMode }
                  : {}),
                ...(scrollTop > 0 ? { scrollTop } : {}),
              }
            : null,
        );
      }}
      onSessionStateChange={(nextState) =>
        context.onFileEditorSessionStateChange(activeSurface.tab.key, nextState)
      }
      sessionState={activeSurface.sessionState}
      workspaceId={activeSurface.workspaceId}
    />
  ),
  resolveActiveSurface: (tab, context) => ({
    kind: "file-editor",
    sessionState: context.fileEditorSessionsByTabKey[tab.key] ?? null,
    tab,
    viewState: context.viewStateByTabKey[tab.key] ?? null,
    workspaceId: context.workspaceId,
  }),
  resolveTabStatus: (tab, context) => ({
    isDirty: isFileEditorDirty(context.fileEditorSessionsByTabKey[tab.key] ?? null),
    isRunning: false,
    needsAttention: false,
  }),
  serializeTab: serializeFileEditorTab,
};

export function parsePersistedFileEditorTab(value: unknown): FileEditorTab | null {
  if (!isRecord(value)) {
    return null;
  }

  const filePath = getOptionalString(value, "filePath");
  return filePath ? createFileEditorTab(filePath) : null;
}

export function serializeFileEditorTab(tab: FileEditorTab): Record<string, unknown> {
  return {
    filePath: tab.filePath,
    kind: tab.kind,
  };
}
