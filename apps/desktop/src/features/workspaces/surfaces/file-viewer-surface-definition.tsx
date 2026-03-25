import { FileText, PenTool } from "lucide-react";
import { FileSurface } from "@/features/explorer/components/file-surface";
import { isFileViewerDirty } from "@/features/explorer/lib/file-session";
import { WorkspaceSurfaceBubble } from "@/features/workspaces/surfaces/workspace-surface-tab-icons";
import {
  getOptionalString,
  isRecord,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import {
  areFileViewerSessionStatesEqual,
  areWorkspaceCanvasViewStatesEqual,
  type WorkspaceSurfaceDefinition,
} from "@/features/workspaces/surfaces/workspace-surface-types";
import {
  createFileViewerTab,
  fileViewerTabKey,
  type FileViewerTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";

export const fileViewerSurfaceDefinition: WorkspaceSurfaceDefinition<"file-viewer"> = {
  areActiveSurfacesEqual: (previous, next) =>
    previous.tab === next.tab &&
    previous.workspaceId === next.workspaceId &&
    areWorkspaceCanvasViewStatesEqual(previous.viewState, next.viewState) &&
    areFileViewerSessionStatesEqual(previous.sessionState, next.sessionState),
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
  createTab: (options) => createFileViewerTab(options.filePath),
  getTabKey: (options) => fileViewerTabKey(options.filePath),
  parsePersistedTab: parsePersistedFileViewerTab,
  renderActiveSurface: (activeSurface, context) => (
    <FileSurface
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
        context.onFileSessionStateChange(activeSurface.tab.key, nextState)
      }
      sessionState={activeSurface.sessionState}
      workspaceId={activeSurface.workspaceId}
    />
  ),
  resolveActiveSurface: (tab, context) => ({
    kind: "file-viewer",
    sessionState: context.fileSessionsByTabKey[tab.key] ?? null,
    tab,
    viewState: context.viewStateByTabKey[tab.key] ?? null,
    workspaceId: context.workspaceId,
  }),
  resolveTabStatus: (tab, context) => ({
    isDirty: isFileViewerDirty(context.fileSessionsByTabKey[tab.key] ?? null),
    isRunning: false,
    needsAttention: false,
  }),
  serializeTab: serializeFileViewerTab,
};

export function parsePersistedFileViewerTab(value: unknown): FileViewerTab | null {
  if (!isRecord(value)) {
    return null;
  }

  const filePath = getOptionalString(value, "filePath");
  return filePath ? createFileViewerTab(filePath) : null;
}

export function serializeFileViewerTab(tab: FileViewerTab): Record<string, unknown> {
  return {
    filePath: tab.filePath,
    kind: tab.kind,
  };
}
