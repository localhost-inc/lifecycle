import type { GitPullRequestSummary, WorkspaceHost } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useGitActions } from "@/features/git/hooks/use-git-actions";
import { ChangesTab } from "@/features/git/components/changes-tab";

export const GIT_CHANGES_PANEL_BODY_CLASS_NAME = "px-2.5 pb-4";
export const GIT_CHANGES_PANEL_EMPTY_STATE_CLASS_NAME = "px-2.5 py-4";

interface GitChangesPanelProps {
  onCommitComplete: () => void;
  onOpenDiff: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  onShowChanges: () => void;
  workspaceId: string;
  workspaceHost: WorkspaceHost;
  worktreePath: string | null;
}

export function GitChangesPanel({
  onCommitComplete,
  onOpenDiff,
  onOpenFile,
  onOpenPullRequest,
  onShowChanges: _onShowChanges,
  workspaceId,
  workspaceHost,
  worktreePath,
}: GitChangesPanelProps) {
  const supportsChanges =
    (workspaceHost === "local" || workspaceHost === "docker") && worktreePath !== null;
  const gitActions = useGitActions({
    onCommitComplete,
    onOpenPullRequest,
    workspaceId,
    workspaceHost,
    worktreePath,
  });

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
              onRefresh={async () => {
                await gitActions.gitStatusQuery.refetch();
              }}
              workspaceHost={workspaceHost}
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
