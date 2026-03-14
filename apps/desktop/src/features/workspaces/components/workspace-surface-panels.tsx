import type { TerminalRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import type { CreateTerminalRequest, HarnessProvider } from "../../terminals/api";
import { TerminalSurface } from "../../terminals/components/terminal-surface";
import { GitDiffSurface } from "../../git/components/git-diff-surface";
import { PullRequestSurface } from "../../git/components/pull-request-surface";
import { FileSurface } from "../../files/components/file-surface";
import type { FileViewerSessionState } from "../../files/lib/file-session";
import {
  isChangesDiffDocument,
  isCommitDiffDocument,
  isFileViewerDocument,
  isPullRequestDocument,
  type WorkspaceSurfaceDocument,
  type WorkspaceSurfaceTabViewState,
} from "../state/workspace-surface-state";
import { WorkspaceEmptyPaneState } from "./workspace-empty-pane-state";
import { workspaceTabDomId, workspaceTabPanelId } from "./workspace-surface-ids";

interface WorkspaceSurfacePanelsProps {
  activeTabKey: string | null;
  activeTabViewState: WorkspaceSurfaceTabViewState | null;
  activeFileSessionState: FileViewerSessionState | null;
  creatingSelection: "shell" | HarnessProvider | null;
  documents: WorkspaceSurfaceDocument[];
  hasVisibleTabs: boolean;
  onFileSessionStateChange: (tabKey: string, state: FileViewerSessionState | null) => void;
  onCreateTerminal: (input: CreateTerminalRequest) => Promise<void>;
  onOpenFile: (filePath: string) => void;
  onTabViewStateChange: (tabKey: string, viewState: WorkspaceSurfaceTabViewState | null) => void;
  paneDragInProgress: boolean;
  paneFocused: boolean;
  terminals: TerminalRecord[];
  waitingForSelectedRuntimeTab: boolean;
  workspaceId: string;
}

export function WorkspaceSurfacePanels({
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
  terminals,
  waitingForSelectedRuntimeTab,
  workspaceId,
}: WorkspaceSurfacePanelsProps) {
  if (!hasVisibleTabs) {
    return waitingForSelectedRuntimeTab ? (
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
      : (terminals.find((terminal) => `terminal:${terminal.id}` === activeTabKey) ?? null);
  const activeDocument =
    activeTabKey === null
      ? null
      : (documents.find((document) => document.key === activeTabKey) ?? null);
  const activePanelId = activeTabKey ? workspaceTabPanelId(activeTabKey) : undefined;
  const activeTabDomId = activeTabKey ? workspaceTabDomId(activeTabKey) : undefined;

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
        <TerminalSurface
          focused={paneFocused}
          tabDragInProgress={paneDragInProgress}
          terminal={activeTerminal}
        />
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
          onOpenFile={onOpenFile}
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
