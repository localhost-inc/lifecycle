import type { GitPullRequestSummary, WorkspaceMode } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useGitActions } from "../hooks/use-git-actions";
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
  const supportsChanges = workspaceMode === "local" && worktreePath !== null;
  const gitActions = useGitActions({
    onCommitComplete,
    onOpenPullRequest,
    workspaceId,
    workspaceMode,
    worktreePath,
  });

  return (
    <section className="flex min-h-0 h-full flex-col">
      <div className="flex items-center justify-end px-2.5 py-2">
        <div className="shrink-0">
          <GitActionButton
            actionError={gitActions.actionError}
            branchPullRequest={gitActions.branchPullRequest}
            gitStatus={gitActions.gitStatusQuery.data ?? null}
            size="default"
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
            onShowChanges={gitActions.handleShowChanges}
          />
        </div>
      </div>
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
    </section>
  );
}
