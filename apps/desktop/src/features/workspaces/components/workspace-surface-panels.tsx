import type { GitDiffScope } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import type { CreateTerminalRequest, HarnessProvider, TerminalRow } from "../../terminals/api";
import { TerminalSurface } from "../../terminals/components/terminal-surface";
import { CommitDiffViewerSurface } from "../../git/components/commit-diff-viewer-surface";
import { DiffViewerSurface } from "../../git/components/diff-viewer-surface";
import {
  isCommitDiffDocument,
  isFileDiffDocument,
  isLauncherDocument,
  type WorkspaceSurfaceDocument,
} from "../state/workspace-surface-state";
import { WorkspaceLauncherSurface } from "./workspace-launcher-surface";
import { workspaceTabDomId, workspaceTabPanelId } from "./workspace-surface-logic";

interface WorkspaceSurfacePanelsProps {
  activeTabKey: string | null;
  activeTerminalId: string | null;
  creatingSelection: "shell" | HarnessProvider | null;
  documents: WorkspaceSurfaceDocument[];
  hasVisibleTabs: boolean;
  onChangeFileDiffScope: (key: string, scope: GitDiffScope) => void;
  onCreateTerminal: (input: CreateTerminalRequest, launcherKey?: string) => Promise<void>;
  onOpenTerminal: (terminalId: string, launcherKey?: string) => void;
  sessionHistory: TerminalRow[];
  terminals: TerminalRow[];
  waitingForActiveRuntimeTab: boolean;
  workspaceId: string;
}

export function WorkspaceSurfacePanels({
  activeTabKey,
  activeTerminalId,
  creatingSelection,
  documents,
  hasVisibleTabs,
  onChangeFileDiffScope,
  onCreateTerminal,
  onOpenTerminal,
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

  return (
    <>
      {terminals.map((terminal) => {
        const key = `terminal:${terminal.id}`;
        const active = key === activeTabKey;

        return (
          <div
            key={terminal.id}
            id={workspaceTabPanelId(key)}
            aria-labelledby={workspaceTabDomId(key)}
            className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
            role="tabpanel"
          >
            <TerminalSurface active={active} terminal={terminal} />
          </div>
        );
      })}

      {documents.map((tab) => {
        const active = tab.key === activeTabKey;

        return (
          <div
            key={tab.key}
            id={workspaceTabPanelId(tab.key)}
            aria-labelledby={workspaceTabDomId(tab.key)}
            className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
            role="tabpanel"
          >
            {isFileDiffDocument(tab) ? (
              <DiffViewerSurface
                activeScope={tab.activeScope}
                filePath={tab.filePath}
                onScopeChange={(scope) => {
                  onChangeFileDiffScope(tab.key, scope);
                }}
                workspaceId={workspaceId}
              />
            ) : isCommitDiffDocument(tab) ? (
              <CommitDiffViewerSurface commit={tab} workspaceId={workspaceId} />
            ) : isLauncherDocument(tab) ? (
              <WorkspaceLauncherSurface
                activeTerminalId={activeTerminalId}
                creatingSelection={creatingSelection}
                onCreateTerminal={(input) => {
                  void onCreateTerminal(input, tab.key);
                }}
                onOpenTerminal={(terminalId) => {
                  onOpenTerminal(terminalId, tab.key);
                }}
                onResumeTerminal={(input) => {
                  void onCreateTerminal(input, tab.key);
                }}
                terminals={sessionHistory}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
