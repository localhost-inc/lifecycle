import type {
  GitBranchPullRequestResult,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitStatusResult,
  WorkspaceHost,
} from "@lifecycle/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getCurrentGitPullRequest,
  getGitLog,
  getGitPullRequest,
  getGitPullRequests,
  getGitStatus,
} from "@/features/git/api";
import { gitKeys } from "@/features/git/state/git-query-keys";
import { useOptionalWorkspaceHostClient } from "@lifecycle/workspace/client/react";

interface GitQueryOptions {
  enabled?: boolean;
  polling?: boolean;
}

export function useGitStatus(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
  options?: GitQueryOptions,
): UseQueryResult<GitStatusResult> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled = (options?.enabled ?? true) && client !== null && workspaceId !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId ? gitKeys.status(workspaceId) : ["workspace-git-status", "disabled"],
    queryFn: () => getGitStatus(client!, workspaceId!),
    enabled,
    refetchInterval: enabled && polling ? 3000 : false,
  });
}

export function useGitLog(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
  limit = 50,
  options?: GitQueryOptions,
): UseQueryResult<GitLogEntry[]> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled = (options?.enabled ?? true) && client !== null && workspaceId !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId ? gitKeys.log(workspaceId, limit) : ["workspace-git-log", "disabled"],
    queryFn: () => getGitLog(client!, workspaceId!, limit),
    enabled,
    refetchInterval: enabled && polling ? 10000 : false,
  });
}

export function useGitPullRequests(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
  options?: GitQueryOptions,
): UseQueryResult<GitPullRequestListResult> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled = (options?.enabled ?? true) && client !== null && workspaceId !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId
      ? gitKeys.pullRequests(workspaceId)
      : ["workspace-git-pull-requests", "disabled"],
    queryFn: () => getGitPullRequests(client!, workspaceId!),
    enabled,
    refetchInterval: enabled && polling ? 15000 : false,
  });
}

export function useGitPullRequest(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
  pullRequestNumber: number | null,
  options?: GitQueryOptions,
): UseQueryResult<GitPullRequestDetailResult> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled =
    (options?.enabled ?? true) &&
    client !== null &&
    workspaceId !== null &&
    pullRequestNumber !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey:
      workspaceId && pullRequestNumber !== null
        ? gitKeys.pullRequest(workspaceId, pullRequestNumber!)
        : ["workspace-git-pull-request", "disabled"],
    queryFn: () => getGitPullRequest(client!, workspaceId!, pullRequestNumber!),
    enabled,
    refetchInterval: enabled && polling ? 10000 : false,
  });
}

export function useCurrentGitPullRequest(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
  options?: GitQueryOptions,
): UseQueryResult<GitBranchPullRequestResult> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled = (options?.enabled ?? true) && client !== null && workspaceId !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId
      ? gitKeys.currentPullRequest(workspaceId)
      : ["workspace-git-current-pull-request", "disabled"],
    queryFn: () => getCurrentGitPullRequest(client!, workspaceId!),
    enabled,
    refetchInterval: enabled && polling ? 8000 : false,
  });
}
