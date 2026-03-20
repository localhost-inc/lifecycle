import type {
  GitBranchPullRequestResult,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitStatusResult,
} from "@lifecycle/contracts";
import { useEffect, useMemo } from "react";
import type { QueryDescriptor, QueryResult } from "@/query";
import { useQuery } from "@/query";
import { gitKeys } from "@/features/git/state/git-query-keys";

interface GitQueryOptions {
  enabled?: boolean;
  polling?: boolean;
}

function createGitStatusQuery(workspaceId: string): QueryDescriptor<GitStatusResult> {
  return {
    key: gitKeys.status(workspaceId),
    fetch: (source) => source.getWorkspaceGitStatus(workspaceId),
  };
}

function createGitLogQuery(workspaceId: string, limit: number): QueryDescriptor<GitLogEntry[]> {
  return {
    key: gitKeys.log(workspaceId, limit),
    fetch: (source) => source.getWorkspaceGitLog(workspaceId, limit),
  };
}

function createGitPullRequestsQuery(
  workspaceId: string,
): QueryDescriptor<GitPullRequestListResult> {
  return {
    key: gitKeys.pullRequests(workspaceId),
    fetch: (source) => source.getWorkspaceGitPullRequests(workspaceId),
  };
}

function createGitPullRequestQuery(
  workspaceId: string,
  pullRequestNumber: number,
): QueryDescriptor<GitPullRequestDetailResult> {
  return {
    key: gitKeys.pullRequest(workspaceId, pullRequestNumber),
    fetch: (source) => source.getWorkspaceGitPullRequest(workspaceId, pullRequestNumber),
  };
}

function createCurrentGitPullRequestQuery(
  workspaceId: string,
): QueryDescriptor<GitBranchPullRequestResult> {
  return {
    key: gitKeys.currentPullRequest(workspaceId),
    fetch: (source) => source.getWorkspaceCurrentGitPullRequest(workspaceId),
  };
}

function usePollingRefresh(
  refresh: () => Promise<void>,
  enabled: boolean,
  intervalMs: number,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refreshIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void refresh();
    };

    const timer = window.setInterval(() => {
      refreshIfVisible();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIfVisible();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, refresh]);
}

export function useGitStatus(
  workspaceId: string | null,
  options?: GitQueryOptions,
): QueryResult<GitStatusResult | undefined> {
  const enabled = options?.enabled ?? true;
  const descriptor = useMemo(
    () => (workspaceId && enabled ? createGitStatusQuery(workspaceId) : null),
    [enabled, workspaceId],
  );
  const query = useQuery(descriptor);
  const polling = options?.polling ?? true;

  usePollingRefresh(query.refresh, Boolean(workspaceId) && enabled && polling, 3000);
  return query;
}

export function useGitLog(
  workspaceId: string | null,
  limit = 50,
  options?: GitQueryOptions,
): QueryResult<GitLogEntry[] | undefined> {
  const enabled = options?.enabled ?? true;
  const descriptor = useMemo(
    () => (workspaceId && enabled ? createGitLogQuery(workspaceId, limit) : null),
    [enabled, limit, workspaceId],
  );
  const query = useQuery(descriptor);

  usePollingRefresh(
    query.refresh,
    Boolean(workspaceId) && enabled && (options?.polling ?? true),
    10000,
  );
  return query;
}

export function useGitPullRequests(
  workspaceId: string | null,
  options?: GitQueryOptions,
): QueryResult<GitPullRequestListResult | undefined> {
  const enabled = options?.enabled ?? true;
  const descriptor = useMemo(
    () => (workspaceId && enabled ? createGitPullRequestsQuery(workspaceId) : null),
    [enabled, workspaceId],
  );
  const query = useQuery(descriptor);

  usePollingRefresh(
    query.refresh,
    Boolean(workspaceId) && enabled && (options?.polling ?? true),
    15000,
  );
  return query;
}

export function useGitPullRequest(
  workspaceId: string | null,
  pullRequestNumber: number | null,
  options?: GitQueryOptions,
): QueryResult<GitPullRequestDetailResult | undefined> {
  const enabled = options?.enabled ?? true;
  const descriptor = useMemo(
    () =>
      workspaceId && pullRequestNumber !== null && enabled
        ? createGitPullRequestQuery(workspaceId, pullRequestNumber)
        : null,
    [enabled, pullRequestNumber, workspaceId],
  );
  const query = useQuery(descriptor);

  usePollingRefresh(
    query.refresh,
    Boolean(workspaceId) && pullRequestNumber !== null && enabled && (options?.polling ?? true),
    10000,
  );
  return query;
}

export function useCurrentGitPullRequest(
  workspaceId: string | null,
  options?: GitQueryOptions,
): QueryResult<GitBranchPullRequestResult | undefined> {
  const enabled = options?.enabled ?? true;
  const descriptor = useMemo(
    () => (workspaceId && enabled ? createCurrentGitPullRequestQuery(workspaceId) : null),
    [enabled, workspaceId],
  );
  const query = useQuery(descriptor);

  usePollingRefresh(
    query.refresh,
    Boolean(workspaceId) && enabled && (options?.polling ?? true),
    8000,
  );
  return query;
}
