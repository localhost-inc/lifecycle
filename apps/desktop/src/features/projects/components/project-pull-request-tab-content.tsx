import type { WorkspaceRecord } from "@lifecycle/contracts";
import { EmptyState, Loading } from "@lifecycle/ui";
import { useMemo } from "react";
import { useGitPullRequest, useGitPullRequests } from "../../git/hooks";
import { PullRequestSurface } from "../../git/components/pull-request-surface";

interface ProjectPullRequestTabContentProps {
  projectName: string;
  pullRequestNumber: number;
  repositoryWorkspace: WorkspaceRecord | null;
}

export function ProjectPullRequestTabContent({
  projectName,
  pullRequestNumber,
  repositoryWorkspace,
}: ProjectPullRequestTabContentProps) {
  const workspaceId = repositoryWorkspace?.id ?? null;
  const listQuery = useGitPullRequests(workspaceId, {
    enabled: workspaceId !== null,
  });
  const detailQuery = useGitPullRequest(workspaceId, pullRequestNumber, {
    enabled: workspaceId !== null,
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
