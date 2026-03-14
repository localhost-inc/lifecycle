import type { GitLogEntry, GitPullRequestSummary, WorkspaceMode } from "@lifecycle/contracts";
import { EmptyState, Tabs, TabsList, TabsTrigger, cn } from "@lifecycle/ui";
import { useEffect, useState } from "react";
import { commitGit, createGitPullRequest, mergeGitPullRequest, pushGit } from "../api";
import { useCurrentGitPullRequest, useGitLog, useGitStatus } from "../hooks";
import { GIT_PANEL_TABS, type GitPanelTabValue } from "../lib/git-panel-tabs";
import { ChangesTab } from "./changes-tab";
import { GitActionButton } from "./git-action-button";
import { HistoryTab } from "./history-tab";

export const GIT_PANEL_TITLE = "Git";
export { GIT_PANEL_TABS };
export type { GitPanelTabValue };

interface GitPanelProps {
  activeTab: GitPanelTabValue;
  onOpenDiff: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  onOpenCommitDiff: (entry: GitLogEntry) => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  onActiveTabChange: (tab: GitPanelTabValue) => void;
  workspaceId: string;
  workspaceMode: WorkspaceMode;
  worktreePath: string | null;
}

export const GIT_PANEL_HEADER_CLASS_NAME = "px-2.5 pt-3 pb-0";
export const GIT_PANEL_BODY_CLASS_NAME = "px-2.5 pb-4 pt-0";
export const GIT_PANEL_EMPTY_STATE_CLASS_NAME = "px-2.5 py-4";

function GitPanelPlaceholder({ description, title }: { description: string; title: string }) {
  return <EmptyState description={description} size="sm" title={title} />;
}

export function shouldLoadGitHistory(
  activeTab: GitPanelTabValue,
  supportsChangesAndHistory: boolean,
): boolean {
  return supportsChangesAndHistory && activeTab === "history";
}

export function GitPanel({
  activeTab,
  onOpenDiff,
  onOpenFile,
  onOpenCommitDiff,
  onOpenPullRequest,
  onActiveTabChange,
  workspaceId,
  workspaceMode,
  worktreePath,
}: GitPanelProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCreatingPullRequest, setIsCreatingPullRequest] = useState(false);
  const [isMergingPullRequest, setIsMergingPullRequest] = useState(false);
  const [isPushingBranch, setIsPushingBranch] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const supportsChangesAndHistory = workspaceMode === "local" && worktreePath !== null;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncDocumentVisible = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", syncDocumentVisible);
    return () => {
      document.removeEventListener("visibilitychange", syncDocumentVisible);
    };
  }, []);

  const gitStatusQuery = useGitStatus(supportsChangesAndHistory ? workspaceId : null, {
    polling: documentVisible,
  });
  const gitLogQuery = useGitLog(
    shouldLoadGitHistory(activeTab, supportsChangesAndHistory) ? workspaceId : null,
    50,
    {
      polling: documentVisible,
    },
  );
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId, {
    polling: documentVisible,
  });

  async function refreshPullRequestState(): Promise<void> {
    await Promise.all([
      gitStatusQuery.refresh(),
      gitLogQuery.refresh(),
      currentPullRequestQuery.refresh(),
    ]);
  }

  async function handlePushBranch(): Promise<void> {
    setActionError(null);
    setIsPushingBranch(true);
    try {
      await pushGit(workspaceId);
      await refreshPullRequestState();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPushingBranch(false);
    }
  }

  async function handleCommit(message: string, pushAfterCommit: boolean): Promise<void> {
    let committed = false;
    setActionError(null);
    setIsCommitting(true);

    try {
      await commitGit(workspaceId, message);
      committed = true;

      if (pushAfterCommit) {
        setIsPushingBranch(true);
        try {
          await pushGit(workspaceId);
        } finally {
          setIsPushingBranch(false);
        }
      }

      await refreshPullRequestState();
      onActiveTabChange("history");
    } catch (error) {
      if (committed) {
        await refreshPullRequestState().catch(() => undefined);
      }
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleCreatePullRequest(): Promise<void> {
    setActionError(null);
    setIsCreatingPullRequest(true);
    try {
      const pullRequest = await createGitPullRequest(workspaceId);
      await refreshPullRequestState();
      onOpenPullRequest(pullRequest);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingPullRequest(false);
    }
  }

  async function handleMergePullRequest(pullRequestNumber: number): Promise<void> {
    setActionError(null);
    setIsMergingPullRequest(true);
    try {
      const pullRequest = await mergeGitPullRequest(workspaceId, pullRequestNumber);
      await refreshPullRequestState();
      onOpenPullRequest(pullRequest);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMergingPullRequest(false);
    }
  }

  return (
    <section className="flex min-h-0 h-full flex-col">
      <div className={GIT_PANEL_HEADER_CLASS_NAME}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="app-panel-title">{GIT_PANEL_TITLE}</span>
            <GitActionButton
              actionError={actionError}
              branchPullRequest={currentPullRequestQuery.data ?? null}
              gitStatus={gitStatusQuery.data ?? null}
              isCommitting={isCommitting}
              isCreatingPullRequest={isCreatingPullRequest}
              isLoading={gitStatusQuery.isLoading || currentPullRequestQuery.isLoading}
              isMergingPullRequest={isMergingPullRequest}
              isPushingBranch={isPushingBranch}
              onCommit={handleCommit}
              onCreatePullRequest={handleCreatePullRequest}
              onMergePullRequest={handleMergePullRequest}
              onOpenPullRequest={onOpenPullRequest}
              onPushBranch={handlePushBranch}
              onShowChanges={() => onActiveTabChange("changes")}
            />
          </div>
          <Tabs
            onValueChange={(value) => onActiveTabChange(value as GitPanelTabValue)}
            value={activeTab}
          >
            <TabsList className="-mx-2.5 w-[calc(100%+1.25rem)]" variant="underline">
              {GIT_PANEL_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  title={tab.label}
                  value={tab.value}
                  variant="underline"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={cn("flex min-h-0 flex-1 flex-col", GIT_PANEL_BODY_CLASS_NAME)}>
          {activeTab === "changes" &&
            (supportsChangesAndHistory ? (
              <ChangesTab
                error={gitStatusQuery.error}
                gitStatus={gitStatusQuery.data ?? null}
                isLoading={gitStatusQuery.isLoading}
                onOpenDiff={onOpenDiff}
                onOpenFile={onOpenFile}
                onRefresh={gitStatusQuery.refresh}
                workspaceId={workspaceId}
              />
            ) : (
              <div className={GIT_PANEL_EMPTY_STATE_CLASS_NAME}>
                <GitPanelPlaceholder
                  description="Workspace change tracking will use the cloud provider once cloud Git state exists."
                  title="Changes unavailable"
                />
              </div>
            ))}
          {activeTab === "history" &&
            (supportsChangesAndHistory ? (
              <HistoryTab
                entries={gitLogQuery.data ?? []}
                error={gitLogQuery.error}
                isLoading={gitLogQuery.isLoading}
                onOpenCommit={onOpenCommitDiff}
              />
            ) : (
              <div className={GIT_PANEL_EMPTY_STATE_CLASS_NAME}>
                <GitPanelPlaceholder
                  description="Workspace commit history will use the cloud provider once cloud Git state exists."
                  title="History unavailable"
                />
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
