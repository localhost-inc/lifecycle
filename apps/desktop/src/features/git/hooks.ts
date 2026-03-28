import type {
  GitBranchPullRequestResult,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitStatusResult,
} from "@lifecycle/contracts";
import { useWorkspaceClient } from "@lifecycle/workspace/react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { gitKeys } from "@/features/git/state/git-query-keys";
import { useWorkspace } from "@/store";

interface GitQueryOptions {
  enabled?: boolean;
  polling?: boolean;
}

export function useGitStatus(
  workspaceId: string | null,
  options?: GitQueryOptions,
): UseQueryResult<GitStatusResult> {
  const workspace = useWorkspace(workspaceId);
  const client = useWorkspaceClient();
  const enabled = (options?.enabled ?? true) && workspace !== undefined;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId ? gitKeys.status(workspaceId) : ["workspace-git-status", "disabled"],
    queryFn: () => client!.getGitStatus(workspace!),
    enabled,
    refetchInterval: enabled && polling ? 3000 : false,
  });
}

export function useGitLog(
  workspaceId: string | null,
  limit = 50,
  options?: GitQueryOptions,
): UseQueryResult<GitLogEntry[]> {
  const workspace = useWorkspace(workspaceId);
  const client = useWorkspaceClient();
  const enabled = (options?.enabled ?? true) && workspace !== undefined;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId ? gitKeys.log(workspaceId, limit) : ["workspace-git-log", "disabled"],
    queryFn: () => client!.listGitLog(workspace!, limit),
    enabled,
    refetchInterval: enabled && polling ? 10000 : false,
  });
}

export function useGitPullRequests(
  workspaceId: string | null,
  options?: GitQueryOptions,
): UseQueryResult<GitPullRequestListResult> {
  const workspace = useWorkspace(workspaceId);
  const client = useWorkspaceClient();
  const enabled = (options?.enabled ?? true) && workspace !== undefined;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId
      ? gitKeys.pullRequests(workspaceId)
      : ["workspace-git-pull-requests", "disabled"],
    queryFn: () => client!.listGitPullRequests(workspace!),
    enabled,
    refetchInterval: enabled && polling ? 15000 : false,
  });
}

export function useGitPullRequest(
  workspaceId: string | null,
  pullRequestNumber: number | null,
  options?: GitQueryOptions,
): UseQueryResult<GitPullRequestDetailResult> {
  const workspace = useWorkspace(workspaceId);
  const client = useWorkspaceClient();
  const enabled =
    (options?.enabled ?? true) && workspace !== undefined && pullRequestNumber !== null;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey:
      workspaceId && pullRequestNumber !== null
        ? gitKeys.pullRequest(workspaceId, pullRequestNumber!)
        : ["workspace-git-pull-request", "disabled"],
    queryFn: () => client!.getGitPullRequest(workspace!, pullRequestNumber!),
    enabled,
    refetchInterval: enabled && polling ? 10000 : false,
  });
}

export function useCurrentGitPullRequest(
  workspaceId: string | null,
  options?: GitQueryOptions,
): UseQueryResult<GitBranchPullRequestResult> {
  const workspace = useWorkspace(workspaceId);
  const client = useWorkspaceClient();
  const enabled = (options?.enabled ?? true) && workspace !== undefined;
  const polling = options?.polling ?? true;

  return useQuery({
    queryKey: workspaceId
      ? gitKeys.currentPullRequest(workspaceId)
      : ["workspace-git-current-pull-request", "disabled"],
    queryFn: () => client!.getCurrentGitPullRequest(workspace!),
    enabled,
    refetchInterval: enabled && polling ? 8000 : false,
  });
}
