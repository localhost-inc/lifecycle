import type { GitPullRequestSummary, WorkspaceMode } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useEffect, useState } from "react";
import { commitGit, createGitPullRequest, mergeGitPullRequest, pushGit, stageGitFiles } from "../api";
import { useCurrentGitPullRequest, useGitLog, useGitStatus } from "../hooks";
import { ChangesTab } from "./changes-tab";
import { GitActionButton } from "./git-action-button";

export const GIT_CHANGES_PANEL_BODY_CLASS_NAME = "px-2.5 pb-4";
export const GIT_CHANGES_PANEL_EMPTY_STATE_CLASS_NAME = "px-2.5 py-4";

interface GitChangesPanelProps {
  onCommitComplete: () => void;
  onOpenDiff: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  onShowChanges: () => void;
  workspaceId: string;
  workspaceMode: WorkspaceMode;
  worktreePath: string | null;
}

export function GitChangesPanel({
  onCommitComplete,
  onOpenDiff,
  onOpenFile,
  onOpenPullRequest,
  onShowChanges: _onShowChanges,
  workspaceId,
  workspaceMode,
  worktreePath,
}: GitChangesPanelProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCreatingPullRequest, setIsCreatingPullRequest] = useState(false);
  const [isMergingPullRequest, setIsMergingPullRequest] = useState(false);
  const [isPushingBranch, setIsPushingBranch] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const supportsChanges = workspaceMode === "local" && worktreePath !== null;

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

  const gitStatusQuery = useGitStatus(supportsChanges ? workspaceId : null, {
    polling: documentVisible,
  });
  const gitLogQuery = useGitLog(null, 50, { polling: false });
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
      onCommitComplete();
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
      <div className="flex items-center justify-between gap-3 px-2.5 py-3">
        <span className="app-panel-title">Changes</span>
        <div className="shrink-0">
          <GitActionButton
            actionError={actionError}
            branchPullRequest={currentPullRequestQuery.data ?? null}
            gitStatus={gitStatusQuery.data ?? null}
            size="default"
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
            onShowChanges={async () => {
              const unstaged = (gitStatusQuery.data?.files ?? []).filter((f) => f.unstaged);
              if (unstaged.length > 0) {
                await stageGitFiles(workspaceId, unstaged.map((f) => f.path));
                await gitStatusQuery.refresh();
              }
            }}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={`flex min-h-0 flex-1 flex-col ${GIT_CHANGES_PANEL_BODY_CLASS_NAME}`}>
          {supportsChanges ? (
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
            <div className={GIT_CHANGES_PANEL_EMPTY_STATE_CLASS_NAME}>
              <EmptyState
                description="Workspace change tracking will use the cloud provider once cloud Git state exists."
                size="sm"
                title="Changes unavailable"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
