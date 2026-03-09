import type { GitLogEntry, WorkspaceMode } from "@lifecycle/contracts";
import { EmptyState, Tabs, TabsList, TabsTrigger, cn } from "@lifecycle/ui";
import { useState } from "react";
import {
  commitGit,
  createGitPullRequest,
  mergeGitPullRequest,
  pushGit,
} from "../api";
import {
  useCurrentGitPullRequest,
  useGitLog,
  useGitPullRequests,
  useGitStatus,
} from "../hooks";
import { ChangesTab } from "./changes-tab";
import { GitActionButton } from "./git-action-button";
import { HistoryTab } from "./history-tab";
import { PullRequestsTab } from "./pull-requests-tab";

const sectionHeader =
  "text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)] font-medium";

export const GIT_PANEL_TITLE = "Git";

export const GIT_PANEL_TABS = [
  { label: "Changes", value: "changes" },
  { label: "History", value: "history" },
  { label: "PRs", title: "Pull Requests", value: "pull-requests" },
] as const;

type GitPanelTabValue = (typeof GIT_PANEL_TABS)[number]["value"];

interface GitPanelProps {
  onOpenDiff: (filePath: string) => void;
  onOpenCommitDiff: (entry: GitLogEntry) => void;
  workspaceId: string;
  workspaceMode: WorkspaceMode;
  worktreePath: string | null;
}

export const GIT_PANEL_HEADER_CLASS_NAME = "px-2.5 py-3";
export const GIT_PANEL_BODY_CLASS_NAME = "px-2.5 pb-4 pt-1";
export const GIT_PANEL_EMPTY_STATE_CLASS_NAME = "px-2.5 py-4";

function GitPanelPlaceholder({ description, title }: { description: string; title: string }) {
  return <EmptyState description={description} size="sm" title={title} />;
}

export function GitPanel({
  onOpenDiff,
  onOpenCommitDiff,
  workspaceId,
  workspaceMode,
  worktreePath,
}: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<GitPanelTabValue>("changes");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCreatingPullRequest, setIsCreatingPullRequest] = useState(false);
  const [isMergingPullRequest, setIsMergingPullRequest] = useState(false);
  const [isPushingBranch, setIsPushingBranch] = useState(false);
  const supportsChangesAndHistory = workspaceMode === "local" && worktreePath !== null;
  const gitStatusQuery = useGitStatus(supportsChangesAndHistory ? workspaceId : null);
  const gitLogQuery = useGitLog(supportsChangesAndHistory ? workspaceId : null, 50);
  const pullRequestsQuery = useGitPullRequests(workspaceId);
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId);

  async function refreshPullRequestState(): Promise<void> {
    await Promise.all([
      gitStatusQuery.refresh(),
      gitLogQuery.refresh(),
      pullRequestsQuery.refresh(),
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
      setActiveTab("history");
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
      window.open(pullRequest.url, "_blank", "noopener,noreferrer");
      setActiveTab("pull-requests");
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
      window.open(pullRequest.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMergingPullRequest(false);
    }
  }

  function handleOpenPullRequest(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="flex min-h-0 h-full flex-col">
      <div className={GIT_PANEL_HEADER_CLASS_NAME}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className={sectionHeader}>{GIT_PANEL_TITLE}</span>
            <GitActionButton
              actionError={actionError}
              branchPullRequest={currentPullRequestQuery.data ?? null}
              gitStatus={gitStatusQuery.data ?? null}
              isCommitting={isCommitting}
              isCreatingPullRequest={isCreatingPullRequest}
              isLoading={currentPullRequestQuery.isLoading}
              isMergingPullRequest={isMergingPullRequest}
              isPushingBranch={isPushingBranch}
              onCommit={handleCommit}
              onCreatePullRequest={handleCreatePullRequest}
              onMergePullRequest={handleMergePullRequest}
              onOpenPullRequest={handleOpenPullRequest}
              onPushBranch={handlePushBranch}
              onShowChanges={() => setActiveTab("changes")}
            />
          </div>
          <Tabs
            onValueChange={(value) => setActiveTab(value as GitPanelTabValue)}
            value={activeTab}
          >
            <TabsList className="w-full">
              {GIT_PANEL_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  title={"title" in tab ? tab.title : tab.label}
                  value={tab.value}
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
          {activeTab === "pull-requests" && (
            <PullRequestsTab
              currentBranchPullRequestNumber={currentPullRequestQuery.data?.pullRequest?.number ?? null}
              error={pullRequestsQuery.error}
              isLoading={pullRequestsQuery.isLoading}
              onOpenPullRequest={handleOpenPullRequest}
              result={pullRequestsQuery.data ?? null}
            />
          )}
        </div>
      </div>
    </section>
  );
}
