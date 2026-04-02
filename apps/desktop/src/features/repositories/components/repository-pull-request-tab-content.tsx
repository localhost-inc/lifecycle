import { WorkspaceClientProvider, useWorkspaceClientRegistry } from "@lifecycle/workspace/react";
import { EmptyState, Loading } from "@lifecycle/ui";
import { useMemo } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { PullRequestSurface } from "@/features/git/components/pull-request-surface";
import { useGitPullRequest, useGitPullRequests } from "@/features/git/hooks";
import type { RepositoryRouteOutletContext } from "@/features/repositories/routes/repository-route";

export function RepositoryPullRequestTabContent() {
  const { repository, repositoryWorkspace } = useOutletContext<RepositoryRouteOutletContext>();
  const { prNumber: prNumberParam } = useParams();
  const pullRequestNumber = Number(prNumberParam);
  const repositoryName = repository.name;
  const workspaceClientRegistry = useWorkspaceClientRegistry();

  if (!repositoryWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          description={`Create or open a repository-backed workspace for ${repositoryName} to review pull requests.`}
          title={`PR #${pullRequestNumber} unavailable`}
        />
      </div>
    );
  }

  const workspaceClient = workspaceClientRegistry.resolve(repositoryWorkspace.host);

  return (
    <WorkspaceClientProvider workspaceClient={workspaceClient}>
      <RepositoryPullRequestTabContentBody
        pullRequestNumber={pullRequestNumber}
        workspaceId={repositoryWorkspace.id}
      />
    </WorkspaceClientProvider>
  );
}

function RepositoryPullRequestTabContentBody({
  pullRequestNumber,
  workspaceId,
}: {
  pullRequestNumber: number;
  workspaceId: string;
}) {
  const listQuery = useGitPullRequests(workspaceId, {
    enabled: Number.isInteger(pullRequestNumber) && pullRequestNumber > 0,
  });
  const detailQuery = useGitPullRequest(workspaceId, pullRequestNumber, {
    enabled: Number.isInteger(pullRequestNumber) && pullRequestNumber > 0,
  });
  const pullRequest = useMemo(
    () =>
      detailQuery.data?.pullRequest ??
      listQuery.data?.pullRequests.find((candidate) => candidate.number === pullRequestNumber) ??
      null,
    [detailQuery.data?.pullRequest, listQuery.data?.pullRequests, pullRequestNumber],
  );

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

  return <PullRequestSurface pullRequest={pullRequest} workspaceId={workspaceId} />;
}
