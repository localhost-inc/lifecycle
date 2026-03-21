import type { TerminalRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import type { CreateTerminalRequest, HarnessProvider } from "@/features/terminals/api";
import { TerminalSurface } from "@/features/terminals/components/terminal-surface";
import { GitDiffSurface } from "@/features/git/components/git-diff-surface";
import { PullRequestSurface } from "@/features/git/components/pull-request-surface";
import { FileSurface } from "@/features/files/components/file-surface";
import type { FileViewerSessionState } from "@/features/files/lib/file-session";
import {
  isChangesDiffDocument,
  isCommitDiffDocument,
  isFileViewerDocument,
  isPullRequestDocument,
  terminalTabKey,
  type WorkspaceCanvasDocument,
  type WorkspaceCanvasTabViewState,
} from "@/features/workspaces/state/workspace-canvas-state";
import { WorkspaceEmptyPaneState } from "@/features/workspaces/components/workspace-empty-pane-state";
import { canvasTabDomId, canvasTabPanelId } from "@/features/workspaces/components/workspace-canvas-ids";

interface WorkspacePaneContentProps {
  activeTabKey: string | null;
  activeTabViewState: WorkspaceCanvasTabViewState | null;
  activeFileSessionState: FileViewerSessionState | null;
  creatingSelection: "shell" | HarnessProvider | null;
  documents: WorkspaceCanvasDocument[];
  hasVisibleTabs: boolean;
  onFileSessionStateChange: (tabKey: string, state: FileViewerSessionState | null) => void;
  onCreateTerminal: (input: CreateTerminalRequest) => Promise<void>;
  onOpenFile: (filePath: string) => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceCanvasTabViewState | null) => void;
  paneDragInProgress: boolean;
  paneFocused: boolean;
  surfaceOpacity: number;
  terminals: TerminalRecord[];
  waitingForSelectedTerminalTab: boolean;
  workspaceId: string;
}

export function WorkspacePaneContent({
  activeTabKey,
  activeTabViewState,
  activeFileSessionState,
  creatingSelection,
  documents,
  hasVisibleTabs,
  onFileSessionStateChange,
  onCreateTerminal,
  onOpenFile,
  onTabViewStateChange,
  paneDragInProgress,
  paneFocused,
  surfaceOpacity,
  terminals,
  waitingForSelectedTerminalTab,
  workspaceId,
}: WorkspacePaneContentProps) {
  if (!hasVisibleTabs) {
    return waitingForSelectedTerminalTab ? (
      <EmptyState
        description="Lifecycle is opening your selected terminal tab."
        icon={<TerminalSquare />}
        title="Opening terminal..."
      />
    ) : (
      <WorkspaceEmptyPaneState
        creatingSelection={creatingSelection}
        onCreateTerminal={(input) => {
          void onCreateTerminal(input);
        }}
      />
    );
  }

  const activeTerminal =
    activeTabKey === null
      ? null
      : (terminals.find((terminal) => terminalTabKey(terminal.id) === activeTabKey) ?? null);
  const activeDocument =
    activeTabKey === null
      ? null
      : (documents.find((document) => document.key === activeTabKey) ?? null);
  const activePanelId = activeTabKey ? canvasTabPanelId(activeTabKey) : undefined;
  const activeTabDomId = activeTabKey ? canvasTabDomId(activeTabKey) : undefined;

  if (!activeTerminal && !activeDocument) {
    return (
      <EmptyState
        description="Lifecycle is preparing the selected workspace tab."
        icon={<TerminalSquare />}
        title="Loading tab..."
      />
    );
  }

  return (
    <div
      id={activePanelId}
      aria-labelledby={activeTabDomId}
      className="flex h-full min-h-0 flex-1 flex-col"
      role="tabpanel"
    >
      {activeTerminal ? (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-surface-background)]">
          <TerminalSurface
            focused={paneFocused}
            opacity={surfaceOpacity}
            tabDragInProgress={paneDragInProgress}
            terminal={activeTerminal}
          />
        </div>
      ) : activeDocument && isChangesDiffDocument(activeDocument) ? (
        <GitDiffSurface
          initialScrollTop={activeTabViewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(activeDocument.key, scrollTop > 0 ? { scrollTop } : null);
          }}
          source={{ focusPath: activeDocument.focusPath, mode: "changes" }}
          workspaceId={workspaceId}
        />
      ) : activeDocument && isCommitDiffDocument(activeDocument) ? (
        <GitDiffSurface
          initialScrollTop={activeTabViewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(activeDocument.key, scrollTop > 0 ? { scrollTop } : null);
          }}
          source={{ commit: activeDocument, mode: "commit" }}
          workspaceId={workspaceId}
        />
      ) : activeDocument && isPullRequestDocument(activeDocument) ? (
        <PullRequestSurface
          initialScrollTop={activeTabViewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(activeDocument.key, scrollTop > 0 ? { scrollTop } : null);
          }}
          pullRequest={activeDocument}
          workspaceId={workspaceId}
        />
      ) : activeDocument && isFileViewerDocument(activeDocument) ? (
        <FileSurface
          filePath={activeDocument.filePath}
          initialMode={activeTabViewState?.fileMode}
          initialScrollTop={activeTabViewState?.scrollTop ?? 0}
          onSessionStateChange={(nextState) =>
            onFileSessionStateChange(activeDocument.key, nextState)
          }
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(
              activeDocument.key,
              scrollTop > 0 || activeTabViewState?.fileMode
                ? {
                    ...(activeTabViewState?.fileMode
                      ? { fileMode: activeTabViewState.fileMode }
                      : {}),
                    ...(scrollTop > 0 ? { scrollTop } : {}),
                  }
                : null,
            );
          }}
          onModeChange={(fileMode) => {
            onTabViewStateChange(activeDocument.key, {
              ...(activeTabViewState?.scrollTop && activeTabViewState.scrollTop > 0
                ? { scrollTop: activeTabViewState.scrollTop }
                : {}),
              fileMode,
            });
          }}
          sessionState={activeFileSessionState}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  );
}
