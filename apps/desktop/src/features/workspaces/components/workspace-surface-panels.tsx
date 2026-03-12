import type { TerminalRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import type { CreateTerminalRequest, HarnessProvider } from "../../terminals/api";
import { TerminalSurface } from "../../terminals/components/terminal-surface";
import { GitDiffSurface } from "../../git/components/git-diff-surface";
import type { WorkspaceActivityItem } from "../hooks";
import { PullRequestSurface } from "../../git/components/pull-request-surface";
import { FileViewer } from "./file-viewer";
import {
  isChangesDiffDocument,
  isCommitDiffDocument,
  isFileViewerDocument,
  isLauncherDocument,
  isPullRequestDocument,
  type WorkspaceSurfaceDocument,
  type WorkspaceSurfaceTabViewState,
} from "../state/workspace-surface-state";
import { WorkspaceLauncherSurface } from "./workspace-launcher-surface";
import { workspaceTabDomId, workspaceTabPanelId } from "./workspace-surface-logic";

interface WorkspaceSurfacePanelsProps {
  activeTabKey: string | null;
  activeTerminalId: string | null;
  activeTabViewState: WorkspaceSurfaceTabViewState | null;
  activity: WorkspaceActivityItem[];
  creatingSelection: "shell" | HarnessProvider | null;
  documents: WorkspaceSurfaceDocument[];
  hasVisibleTabs: boolean;
  onCreateTerminal: (input: CreateTerminalRequest, launcherKey?: string) => Promise<void>;
  onOpenFile: (filePath: string) => void;
  onOpenTerminal: (terminalId: string, launcherKey?: string) => void;
  onTabViewStateChange: (viewState: WorkspaceSurfaceTabViewState | null) => void;
  sessionHistory: TerminalRecord[];
  terminals: TerminalRecord[];
  waitingForActiveRuntimeTab: boolean;
  workspaceId: string;
}

export function WorkspaceSurfacePanels({
  activeTabKey,
  activeTerminalId,
  activeTabViewState,
  activity,
  creatingSelection,
  documents,
  hasVisibleTabs,
  onCreateTerminal,
  onOpenFile,
  onOpenTerminal,
  onTabViewStateChange,
  sessionHistory,
  terminals,
  waitingForActiveRuntimeTab,
  workspaceId,
}: WorkspaceSurfacePanelsProps) {
  if (!hasVisibleTabs) {
    return waitingForActiveRuntimeTab ? (
      <EmptyState
        description="Lifecycle is opening your selected terminal tab."
        icon={<TerminalSquare />}
        title="Opening terminal..."
      />
    ) : (
      <EmptyState
        description="Lifecycle is preparing a launcher tab for this workspace."
        icon={<TerminalSquare />}
        title="Preparing workspace tabs"
      />
    );
  }

  const activeTerminal =
    activeTabKey === null
      ? null
      : terminals.find((terminal) => `terminal:${terminal.id}` === activeTabKey) ?? null;
  const activeDocument =
    activeTabKey === null ? null : documents.find((document) => document.key === activeTabKey) ?? null;
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
      className="flex min-h-0 flex-1 flex-col"
      role="tabpanel"
    >
      {activeTerminal ? (
        <TerminalSurface active terminal={activeTerminal} />
      ) : activeDocument && isChangesDiffDocument(activeDocument) ? (
        <GitDiffSurface
          initialScrollTop={activeTabViewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(scrollTop > 0 ? { scrollTop } : null);
          }}
          source={{ focusPath: activeDocument.focusPath, mode: "changes" }}
          workspaceId={workspaceId}
        />
      ) : activeDocument && isCommitDiffDocument(activeDocument) ? (
        <GitDiffSurface
          initialScrollTop={activeTabViewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(scrollTop > 0 ? { scrollTop } : null);
          }}
          source={{ commit: activeDocument, mode: "commit" }}
          workspaceId={workspaceId}
        />
      ) : activeDocument && isPullRequestDocument(activeDocument) ? (
        <PullRequestSurface
          initialScrollTop={activeTabViewState?.scrollTop ?? 0}
          onOpenFile={onOpenFile}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(scrollTop > 0 ? { scrollTop } : null);
          }}
          pullRequest={activeDocument}
          workspaceId={workspaceId}
        />
      ) : activeDocument && isFileViewerDocument(activeDocument) ? (
        <FileViewer
          filePath={activeDocument.filePath}
          initialScrollTop={activeTabViewState?.scrollTop ?? 0}
          onScrollTopChange={(scrollTop: number) => {
            onTabViewStateChange(scrollTop > 0 ? { scrollTop } : null);
          }}
          workspaceId={workspaceId}
        />
      ) : activeDocument && isLauncherDocument(activeDocument) ? (
        <WorkspaceLauncherSurface
          activeTerminalId={activeTerminalId}
          activity={activity}
          creatingSelection={creatingSelection}
          onCreateTerminal={(input) => {
            void onCreateTerminal(input, activeDocument.key);
          }}
          onOpenTerminal={(terminalId) => {
            onOpenTerminal(terminalId, activeDocument.key);
          }}
          onResumeTerminal={(input) => {
            void onCreateTerminal(input, activeDocument.key);
          }}
          terminals={sessionHistory}
        />
      ) : null}
    </div>
  );
}
