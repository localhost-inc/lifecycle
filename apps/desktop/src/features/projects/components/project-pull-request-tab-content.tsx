import { EmptyState, Loading } from "@lifecycle/ui";
import { useMemo } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useGitPullRequest, useGitPullRequests } from "@/features/git/hooks";
import { PullRequestSurface } from "@/features/git/components/pull-request-surface";
import type { ProjectRouteOutletContext } from "@/features/projects/routes/project-route";

export function ProjectPullRequestTabContent() {
  const { project, repositoryWorkspace } = useOutletContext<ProjectRouteOutletContext>();
  const { prNumber: prNumberParam } = useParams();
  const pullRequestNumber = Number(prNumberParam);
  const projectName = project.name;
  const workspaceId = repositoryWorkspace?.id ?? null;
  const listQuery = useGitPullRequests(workspaceId, {
    enabled: workspaceId !== null,
  });
  const detailQuery = useGitPullRequest(workspaceId, pullRequestNumber, {
    enabled: workspaceId !== null && Number.isInteger(pullRequestNumber) && pullRequestNumber > 0,
  });
  const pullRequest = useMemo(
    () =>
      detailQuery.data?.pullRequest ??
      listQuery.data?.pullRequests.find((candidate) => candidate.number === pullRequestNumber) ??
      null,
    [detailQuery.data?.pullRequest, listQuery.data?.pullRequests, pullRequestNumber],
  );

  if (!repositoryWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          description={`Create or open a repository-backed workspace for ${projectName} to review pull requests.`}
          title={`PR #${pullRequestNumber} unavailable`}
        />
      </div>
    );
  }

  if (!pullRequest && (detailQuery.isLoading || listQuery.isLoading)) {
    return <Loading message={`Loading pull request #${pullRequestNumber}...`} />;
  }

  if (!pullRequest) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          description="The pull request could not be loaded from the current provider."
          title={`PR #${pullRequestNumber} unavailable`}
        />
      </div>
    );
  }

  return <PullRequestSurface pullRequest={pullRequest} workspaceId={repositoryWorkspace.id} />;
}
