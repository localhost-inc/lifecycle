import type { TerminalRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import type { CreateTerminalRequest, HarnessProvider } from "../../terminals/api";
import { TerminalSurface } from "../../terminals/components/terminal-surface";
import { GitDiffSurface } from "../../git/components/git-diff-surface";
import type { WorkspaceActivityItem } from "../hooks";
import { PullRequestSurface } from "../../git/components/pull-request-surface";
import {
  isChangesDiffDocument,
  isCommitDiffDocument,
  isLauncherDocument,
  isPullRequestDocument,
  type WorkspaceSurfaceDocument,
} from "../state/workspace-surface-state";
import { WorkspaceLauncherSurface } from "./workspace-launcher-surface";
import { workspaceTabDomId, workspaceTabPanelId } from "./workspace-surface-logic";

interface WorkspaceSurfacePanelsProps {
  activeTabKey: string | null;
  activeTerminalId: string | null;
  activity: WorkspaceActivityItem[];
  creatingSelection: "shell" | HarnessProvider | null;
  documents: WorkspaceSurfaceDocument[];
  hasVisibleTabs: boolean;
  onCreateTerminal: (input: CreateTerminalRequest, launcherKey?: string) => Promise<void>;
  onOpenTerminal: (terminalId: string, launcherKey?: string) => void;
  sessionHistory: TerminalRecord[];
  terminals: TerminalRecord[];
  waitingForActiveRuntimeTab: boolean;
  workspaceId: string;
}

export function WorkspaceSurfacePanels({
  activeTabKey,
  activeTerminalId,
  activity,
  creatingSelection,
  documents,
  hasVisibleTabs,
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
            {isChangesDiffDocument(tab) ? (
              <GitDiffSurface
                source={{ focusPath: tab.focusPath, mode: "changes" }}
                workspaceId={workspaceId}
              />
            ) : isCommitDiffDocument(tab) ? (
              <GitDiffSurface source={{ commit: tab, mode: "commit" }} workspaceId={workspaceId} />
            ) : isPullRequestDocument(tab) ? (
              <PullRequestSurface pullRequest={tab} workspaceId={workspaceId} />
            ) : isLauncherDocument(tab) ? (
              <WorkspaceLauncherSurface
                activeTerminalId={activeTerminalId}
                activity={activity}
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
