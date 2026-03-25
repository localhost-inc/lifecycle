import type { GitPullRequestSummary, WorkspaceTarget } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useCallback } from "react";
import { stageGitFiles } from "@/features/git/api";
import { useGitActions } from "@/features/git/hooks/use-git-actions";
import { ChangesTab } from "@/features/git/components/changes-tab";
import { useClient } from "@/store";

export const GIT_CHANGES_PANEL_BODY_CLASS_NAME = "px-2.5 pb-4";
export const GIT_CHANGES_PANEL_EMPTY_STATE_CLASS_NAME = "px-2.5 py-4";

interface GitChangesPanelProps {
  onCommitComplete: () => void;
  onOpenDiff: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  onShowChanges: () => void;
  workspaceId: string;
  workspaceTarget: WorkspaceTarget;
  worktreePath: string | null;
}

export function GitChangesPanel({
  onCommitComplete,
  onOpenDiff,
  onOpenFile,
  onOpenPullRequest,
  onShowChanges: _onShowChanges,
  workspaceId,
  workspaceTarget,
  worktreePath,
}: GitChangesPanelProps) {
  const client = useClient();
  const supportsChanges =
    (workspaceTarget === "local" || workspaceTarget === "docker") && worktreePath !== null;
  const gitActions = useGitActions({
    onCommitComplete,
    onOpenPullRequest,
    workspaceId,
    workspaceTarget,
    worktreePath,
  });

  const handleStageAll = useCallback(async () => {
    const files = gitActions.gitStatusQuery.data?.files ?? [];
    const unstaged = files.filter((f) => f.unstaged);
    if (unstaged.length > 0) {
      await stageGitFiles(
        client,
        workspaceId,
        unstaged.map((f) => f.path),
      );
      await gitActions.gitStatusQuery.refetch();
    }
  }, [gitActions.gitStatusQuery.data, gitActions.gitStatusQuery.refetch, client, workspaceId]);

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
              onRefresh={async () => { await gitActions.gitStatusQuery.refetch(); }}
              workspaceId={workspaceId}
            />
          ) : (
            <div className={GIT_CHANGES_PANEL_EMPTY_STATE_CLASS_NAME}>
              <EmptyState
                description="Change tracking is only available for workspaces with a local checkout right now."
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
