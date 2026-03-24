import { EmptyState } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import { TerminalSurface } from "@/features/terminals/components/terminal-surface";
import { AgentSurface } from "@/features/agents/components/agent-surface";
import { GitDiffSurface } from "@/features/git/components/git-diff-surface";
import { PullRequestSurface } from "@/features/git/components/pull-request-surface";
import { FileSurface } from "@/features/explorer/components/file-surface";
import { PreviewSurface } from "@/features/workspaces/surfaces/preview-surface";
import type { FileViewerSessionState } from "@/features/explorer/lib/file-session";
import type { WorkspacePaneActiveSurfaceModel } from "@/features/workspaces/canvas/workspace-pane-models";
import type { WorkspaceCanvasTabViewState } from "@/features/workspaces/state/workspace-canvas-state";
import { WorkspaceEmptyPaneState } from "@/features/workspaces/canvas/panes/workspace-empty-pane-state";
import {
  canvasTabDomId,
  canvasTabPanelId,
} from "@/features/workspaces/canvas/workspace-canvas-ids";
import type { SurfaceLaunchRequest } from "@/features/workspaces/surfaces/surface-launch-actions";

interface WorkspacePaneContentProps {
  activeSurface: WorkspacePaneActiveSurfaceModel;
  onFileSessionStateChange: (tabKey: string, state: FileViewerSessionState | null) => void;
  onLaunchSurface: (request: SurfaceLaunchRequest) => void;
  onOpenFile: (filePath: string) => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => void;
  paneDragInProgress: boolean;
  paneFocused: boolean;
  surfaceOpacity: number;
}

export function WorkspacePaneContent({
  activeSurface,
  onFileSessionStateChange,
  onLaunchSurface,
  onOpenFile,
  onTabViewStateChange,
  paneDragInProgress,
  paneFocused,
  surfaceOpacity,
}: WorkspacePaneContentProps) {
  if (activeSurface.kind === "waiting-terminal") {
    return (
      <EmptyState
        description="Lifecycle is opening your selected terminal tab."
        icon={<TerminalSquare />}
        title="Opening terminal..."
      />
    );
  }

  if (activeSurface.kind === "launcher") {
    return (
      <WorkspaceEmptyPaneState
        creatingSelection={activeSurface.creatingSelection}
        onLaunchSurface={onLaunchSurface}
      />
    );
  }

  if (activeSurface.kind === "opening-terminal") {
    return (
      <EmptyState
        description="Lifecycle is opening your terminal."
        icon={<TerminalSquare />}
        title="Opening terminal..."
      />
    );
  }

  if (activeSurface.kind === "loading") {
    return (
      <EmptyState
        description="Lifecycle is preparing the selected workspace tab."
        icon={<TerminalSquare />}
        title="Loading tab..."
      />
    );
  }

  const activeTabKey =
    activeSurface.kind === "terminal" ? activeSurface.tab.key : activeSurface.document.key;
  const activePanelId = canvasTabPanelId(activeTabKey);
  const activeTabDomId = canvasTabDomId(activeTabKey);

  return (
    <div
      id={activePanelId}
      aria-labelledby={activeTabDomId}
      className="flex h-full min-h-0 flex-1 flex-col"
      role="tabpanel"
    >
      {activeSurface.kind === "terminal" ? (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-surface-background)]">
          <TerminalSurface
            focused={paneFocused}
            opacity={surfaceOpacity}
            tabDragInProgress={paneDragInProgress}
            terminal={activeSurface.terminal}
          />
        </div>
      ) : activeSurface.kind === "changes-diff" ? (
        <GitDiffSurface
          initialScrollTop={activeSurface.viewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(activeSurface.document.key, scrollTop > 0 ? { scrollTop } : null);
          }}
          source={{ focusPath: activeSurface.document.focusPath, mode: "changes" }}
          workspaceId={activeSurface.workspaceId}
        />
      ) : activeSurface.kind === "commit-diff" ? (
        <GitDiffSurface
          initialScrollTop={activeSurface.viewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(activeSurface.document.key, scrollTop > 0 ? { scrollTop } : null);
          }}
          source={{ commit: activeSurface.document, mode: "commit" }}
          workspaceId={activeSurface.workspaceId}
        />
      ) : activeSurface.kind === "preview" ? (
        <PreviewSurface
          tabKey={activeSurface.document.key}
          title={activeSurface.document.label}
          url={activeSurface.document.url}
        />
      ) : activeSurface.kind === "agent" ? (
        <div
          className="flex min-h-0 flex-1 flex-col transition-opacity duration-200 ease-in-out"
          style={{ opacity: surfaceOpacity }}
        >
          <AgentSurface
            agentSessionId={activeSurface.document.agentSessionId}
            paneFocused={paneFocused}
            workspaceId={activeSurface.workspaceId}
          />
        </div>
      ) : activeSurface.kind === "pull-request" ? (
        <PullRequestSurface
          initialScrollTop={activeSurface.viewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(activeSurface.document.key, scrollTop > 0 ? { scrollTop } : null);
          }}
          pullRequest={activeSurface.document}
          workspaceId={activeSurface.workspaceId}
        />
      ) : activeSurface.kind === "file-viewer" ? (
        <FileSurface
          filePath={activeSurface.document.filePath}
          initialMode={activeSurface.viewState?.fileMode}
          initialScrollTop={activeSurface.viewState?.scrollTop ?? 0}
          onSessionStateChange={(nextState) =>
            onFileSessionStateChange(activeSurface.document.key, nextState)
          }
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(
              activeSurface.document.key,
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
          onModeChange={(fileMode) => {
            onTabViewStateChange(activeSurface.document.key, {
              ...(activeSurface.viewState?.scrollTop && activeSurface.viewState.scrollTop > 0
                ? { scrollTop: activeSurface.viewState.scrollTop }
                : {}),
              fileMode,
            });
          }}
          sessionState={activeSurface.sessionState}
          workspaceId={activeSurface.workspaceId}
        />
      ) : null}
    </div>
  );
}
