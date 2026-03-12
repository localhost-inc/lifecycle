import type {
  GitBranchPullRequestResult,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import { isGitPanelTabValue, type GitPanelTabValue } from "../../git/lib/git-panel-tabs";

export const WORKSPACE_ROUTE_GIT_TAB_PARAM = "git";
export const WORKSPACE_ROUTE_PULL_REQUEST_PARAM = "pr";

export interface WorkspaceRouteState {
  gitTab: GitPanelTabValue;
  pullRequestNumber: number | null;
}

export interface WorkspaceRouteStatePatch {
  gitTab?: GitPanelTabValue;
  pullRequestNumber?: number | null;
}

export interface ResolveWorkspaceRoutePullRequestInput {
  currentPullRequestResult?: GitBranchPullRequestResult;
  detailPullRequestResult?: GitPullRequestDetailResult;
  listPullRequestsResult?: GitPullRequestListResult;
  pullRequestNumber: number | null;
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readWorkspaceRouteState(searchParams: URLSearchParams): WorkspaceRouteState {
  const gitTabParam = searchParams.get(WORKSPACE_ROUTE_GIT_TAB_PARAM);

  return {
    gitTab: isGitPanelTabValue(gitTabParam) ? gitTabParam : "changes",
    pullRequestNumber: parsePositiveInteger(searchParams.get(WORKSPACE_ROUTE_PULL_REQUEST_PARAM)),
  };
}

export function updateWorkspaceRouteState(
  searchParams: URLSearchParams,
  patch: WorkspaceRouteStatePatch,
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams);

  if (patch.gitTab !== undefined) {
    if (patch.gitTab === "changes") {
      nextSearchParams.delete(WORKSPACE_ROUTE_GIT_TAB_PARAM);
    } else {
      nextSearchParams.set(WORKSPACE_ROUTE_GIT_TAB_PARAM, patch.gitTab);
    }
  }

  if (patch.pullRequestNumber !== undefined) {
    if (patch.pullRequestNumber === null) {
      nextSearchParams.delete(WORKSPACE_ROUTE_PULL_REQUEST_PARAM);
    } else {
      nextSearchParams.set(WORKSPACE_ROUTE_PULL_REQUEST_PARAM, String(patch.pullRequestNumber));
    }
  }

  return nextSearchParams;
}

export function resolveWorkspaceRoutePullRequest({
  currentPullRequestResult,
  detailPullRequestResult,
  listPullRequestsResult,
  pullRequestNumber,
}: ResolveWorkspaceRoutePullRequestInput): GitPullRequestSummary | null {
  if (pullRequestNumber === null) {
    return null;
  }

  const detailPullRequest = detailPullRequestResult?.pullRequest;
  if (detailPullRequest?.number === pullRequestNumber) {
    return detailPullRequest;
  }

  const currentPullRequest = currentPullRequestResult?.pullRequest;
  if (currentPullRequest?.number === pullRequestNumber) {
    return currentPullRequest;
  }

  return (
    listPullRequestsResult?.pullRequests.find(
      (pullRequest) => pullRequest.number === pullRequestNumber,
    ) ?? null
  );
}
