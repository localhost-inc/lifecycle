import type { GitPullRequestSummary, WorkspaceMode } from "@lifecycle/contracts";
import { useEffect, useState } from "react";
import { useCurrentGitPullRequest, useGitPullRequests } from "@/features/git/hooks";
import { PullRequestsTab } from "@/features/git/components/pull-requests-tab";

interface GitPullRequestsPanelProps {
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  workspaceId: string;
  workspaceMode: WorkspaceMode;
  worktreePath: string | null;
}

export function GitPullRequestsPanel({
  onOpenPullRequest,
  workspaceId,
  workspaceMode,
  worktreePath,
}: GitPullRequestsPanelProps) {
  const supportsGit = workspaceMode === "local" && worktreePath !== null;
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

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

  const pullRequestsQuery = useGitPullRequests(supportsGit ? workspaceId : null, {
    polling: documentVisible,
  });
  const currentPullRequestQuery = useCurrentGitPullRequest(supportsGit ? workspaceId : null, {
    polling: documentVisible,
  });

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5">
        <PullRequestsTab
          currentBranchPullRequestNumber={currentPullRequestQuery.data?.pullRequest?.number ?? null}
          error={pullRequestsQuery.error}
          isLoading={pullRequestsQuery.isLoading}
          onOpenPullRequest={onOpenPullRequest}
          result={pullRequestsQuery.data ?? null}
        />
      </div>
    </section>
  );
}
