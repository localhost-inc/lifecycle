import type { WorkspaceRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useCurrentGitPullRequest, useGitPullRequests } from "../../git/hooks";
import { PullRequestsTab } from "../../git/components/pull-requests-tab";

interface ProjectPullRequestsSurfaceProps {
  projectName: string;
  repositoryWorkspace: WorkspaceRecord | null;
  onOpenPullRequest: (pullRequestNumber: number) => void;
}

export function ProjectPullRequestsSurface({
  projectName,
  repositoryWorkspace,
  onOpenPullRequest,
}: ProjectPullRequestsSurfaceProps) {
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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-8 py-8">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Pull Requests
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{projectName}</h2>
      </div>
      <PullRequestsTab
        currentBranchPullRequestNumber={currentPullRequestQuery.data?.pullRequest?.number ?? null}
        error={pullRequestsQuery.error}
        isLoading={pullRequestsQuery.isLoading}
        onOpenPullRequest={(pullRequest) => onOpenPullRequest(pullRequest.number)}
        result={pullRequestsQuery.data ?? null}
      />
    </div>
  );
}
