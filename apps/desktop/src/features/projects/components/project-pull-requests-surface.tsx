import { EmptyState } from "@lifecycle/ui";
import { useCallback } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useCurrentGitPullRequest, useGitPullRequests } from "@/features/git/hooks";
import { PullRequestsTab } from "@/features/git/components/pull-requests-tab";
import type { ProjectRouteOutletContext } from "@/features/projects/routes/project-route";

export function ProjectPullRequestsSurface() {
  const { project, repositoryWorkspace } = useOutletContext<ProjectRouteOutletContext>();
  const projectName = project.name;
  const navigate = useNavigate();

  const onOpenPullRequest = useCallback(
    (pullRequestNumber: number) => {
      void navigate(`/projects/${project.id}/pulls/${pullRequestNumber}`);
    },
    [navigate, project.id],
  );
  const workspaceId = repositoryWorkspace?.id ?? null;
  const pullRequestsQuery = useGitPullRequests(workspaceId, {
    enabled: workspaceId !== null,
  });
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId, {
    enabled: workspaceId !== null,
  });

  if (!repositoryWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          description={`Create or open a repository-backed workspace for ${projectName} to browse pull requests.`}
          title="Pull requests unavailable"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col px-8 py-8">
      <div className="mb-6 shrink-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Pull Requests
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{projectName}</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PullRequestsTab
          currentBranchPullRequestNumber={currentPullRequestQuery.data?.pullRequest?.number ?? null}
          error={pullRequestsQuery.error}
          isLoading={pullRequestsQuery.isLoading}
          onOpenPullRequest={(pullRequest) => onOpenPullRequest(pullRequest.number)}
          result={pullRequestsQuery.data ?? null}
        />
      </div>
    </div>
  );
}
