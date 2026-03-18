import type { GitPullRequestSummary, WorkspaceMode } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useCallback } from "react";
import { stageGitFiles } from "../api";
import { useGitActions } from "../hooks/use-git-actions";
import { ChangesTab } from "./changes-tab";
import { GitActionBar } from "./git-action-bar";

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
  const supportsChanges = workspaceMode === "local" && worktreePath !== null;
  const gitActions = useGitActions({
    onCommitComplete,
    onOpenPullRequest,
    workspaceId,
    workspaceMode,
    worktreePath,
  });

  const handleStageAll = useCallback(async () => {
    const files = gitActions.gitStatusQuery.data?.files ?? [];
    const unstaged = files.filter((f) => f.unstaged);
    if (unstaged.length > 0) {
      await stageGitFiles(
        workspaceId,
        unstaged.map((f) => f.path),
      );
      await gitActions.gitStatusQuery.refresh();
    }
  }, [gitActions.gitStatusQuery, workspaceId]);

  return (
    <section className="relative flex min-h-0 h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={`flex min-h-0 flex-1 flex-col ${GIT_CHANGES_PANEL_BODY_CLASS_NAME}`}>
          {supportsChanges ? (
            <ChangesTab
              error={gitActions.gitStatusQuery.error}
              gitStatus={gitActions.gitStatusQuery.data ?? null}
              isLoading={gitActions.gitStatusQuery.isLoading}
              onOpenDiff={onOpenDiff}
              onOpenFile={onOpenFile}
              onRefresh={gitActions.gitStatusQuery.refresh}
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
      {supportsChanges && (
        <GitActionBar
          actionError={gitActions.actionError}
          branchPullRequest={gitActions.branchPullRequest ?? null}
          gitStatus={gitActions.gitStatusQuery.data ?? null}
          isCommitting={gitActions.isCommitting}
          isCreatingPullRequest={gitActions.isCreatingPullRequest}
          isLoading={gitActions.isLoading}
          isMergingPullRequest={gitActions.isMergingPullRequest}
          isPushingBranch={gitActions.isPushingBranch}
          onCommit={gitActions.handleCommit}
          onCreatePullRequest={gitActions.handleCreatePullRequest}
          onMergePullRequest={gitActions.handleMergePullRequest}
          onOpenPullRequest={onOpenPullRequest}
          onPushBranch={gitActions.handlePushBranch}
          onStageAll={handleStageAll}
        />
      )}
    </section>
  );
}
