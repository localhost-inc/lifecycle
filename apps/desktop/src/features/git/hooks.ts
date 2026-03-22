import type {
  GitBranchPullRequestResult,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitStatusResult,
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
import { useRuntime } from "@/store";

interface GitQueryOptions {
  enabled?: boolean;
  polling?: boolean;
}

export function useGitStatus(
  workspaceId: string | null,
  options?: GitQueryOptions,
): UseQueryResult<GitStatusResult> {
  const runtime = useRuntime();
  const enabled = (options?.enabled ?? true) && workspaceId !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId ? gitKeys.status(workspaceId) : ["workspace-git-status", "disabled"],
    queryFn: () => getGitStatus(runtime, workspaceId!),
    enabled,
    refetchInterval: enabled && polling ? 3000 : false,
  });
}

export function useGitLog(
  workspaceId: string | null,
  limit = 50,
  options?: GitQueryOptions,
): UseQueryResult<GitLogEntry[]> {
  const runtime = useRuntime();
  const enabled = (options?.enabled ?? true) && workspaceId !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId
      ? gitKeys.log(workspaceId, limit)
      : ["workspace-git-log", "disabled"],
    queryFn: () => getGitLog(runtime, workspaceId!, limit),
    enabled,
    refetchInterval: enabled && polling ? 10000 : false,
  });
}

export function useGitPullRequests(
  workspaceId: string | null,
  options?: GitQueryOptions,
): UseQueryResult<GitPullRequestListResult> {
  const runtime = useRuntime();
  const enabled = (options?.enabled ?? true) && workspaceId !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId
      ? gitKeys.pullRequests(workspaceId)
      : ["workspace-git-pull-requests", "disabled"],
    queryFn: () => getGitPullRequests(runtime, workspaceId!),
    enabled,
    refetchInterval: enabled && polling ? 15000 : false,
  });
}

export function useGitPullRequest(
  workspaceId: string | null,
  pullRequestNumber: number | null,
  options?: GitQueryOptions,
): UseQueryResult<GitPullRequestDetailResult> {
  const runtime = useRuntime();
  const enabled =
    (options?.enabled ?? true) && workspaceId !== null && pullRequestNumber !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey:
      workspaceId && pullRequestNumber !== null
        ? gitKeys.pullRequest(workspaceId, pullRequestNumber!)
        : ["workspace-git-pull-request", "disabled"],
    queryFn: () => getGitPullRequest(runtime, workspaceId!, pullRequestNumber!),
    enabled,
    refetchInterval: enabled && polling ? 10000 : false,
  });
}

export function useCurrentGitPullRequest(
  workspaceId: string | null,
  options?: GitQueryOptions,
): UseQueryResult<GitBranchPullRequestResult> {
  const runtime = useRuntime();
  const enabled = (options?.enabled ?? true) && workspaceId !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId
      ? gitKeys.currentPullRequest(workspaceId)
      : ["workspace-git-current-pull-request", "disabled"],
    queryFn: () => getCurrentGitPullRequest(runtime, workspaceId!),
    enabled,
    refetchInterval: enabled && polling ? 8000 : false,
  });
}
