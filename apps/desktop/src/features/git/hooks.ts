import type {
  GitBranchPullRequestResult,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitStatusResult,
  LifecycleEvent,
  LifecycleEventKind,
} from "@lifecycle/contracts";
import { useEffect, useMemo } from "react";
import type { QueryDescriptor, QueryResult, QueryUpdate } from "../../query";
import { useQuery } from "../../query";

export const gitKeys = {
  currentPullRequest: (workspaceId: string) =>
    ["workspace-git-current-pull-request", workspaceId] as const,
  log: (workspaceId: string, limit: number) => ["workspace-git-log", workspaceId, limit] as const,
  pullRequest: (workspaceId: string, pullRequestNumber: number) =>
    ["workspace-git-pull-request", workspaceId, pullRequestNumber] as const,
  pullRequests: (workspaceId: string) => ["workspace-git-pull-requests", workspaceId] as const,
  status: (workspaceId: string) => ["workspace-git-status", workspaceId] as const,
};

interface GitQueryOptions {
  polling?: boolean;
}

const GIT_STATUS_EVENT_KINDS = [
  "git.head_changed",
  "git.status_changed",
] as const satisfies readonly LifecycleEventKind[];
const GIT_LOG_EVENT_KINDS = [
  "git.head_changed",
  "git.log_changed",
] as const satisfies readonly LifecycleEventKind[];
const GIT_PULL_REQUEST_EVENT_KINDS = [
  "git.head_changed",
] as const satisfies readonly LifecycleEventKind[];

function invalidateGitWorkspaceQuery<T>(
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<T> {
  switch (event.kind) {
    case "git.status_changed":
    case "git.head_changed":
    case "git.log_changed":
      return event.workspace_id === workspaceId ? { kind: "invalidate" } : { kind: "none" };
    default:
      return { kind: "none" };
  }
}

function createGitStatusQuery(workspaceId: string): QueryDescriptor<GitStatusResult> {
  return {
    eventKinds: GIT_STATUS_EVENT_KINDS,
    key: gitKeys.status(workspaceId),
    fetch(source) {
      return source.getWorkspaceGitStatus(workspaceId);
    },
    reduce(_current, event) {
      return invalidateGitWorkspaceQuery(event, workspaceId);
    },
  };
}

function createGitLogQuery(workspaceId: string, limit: number): QueryDescriptor<GitLogEntry[]> {
  return {
    eventKinds: GIT_LOG_EVENT_KINDS,
    key: gitKeys.log(workspaceId, limit),
    fetch(source) {
      return source.getWorkspaceGitLog(workspaceId, limit);
    },
    reduce(_current, event) {
      return invalidateGitWorkspaceQuery(event, workspaceId);
    },
  };
}

function createGitPullRequestsQuery(
  workspaceId: string,
): QueryDescriptor<GitPullRequestListResult> {
  return {
    eventKinds: GIT_PULL_REQUEST_EVENT_KINDS,
    key: gitKeys.pullRequests(workspaceId),
    fetch(source) {
      return source.getWorkspaceGitPullRequests(workspaceId);
    },
    reduce(_current, event) {
      return invalidateGitWorkspaceQuery(event, workspaceId);
    },
  };
}

function createGitPullRequestQuery(
  workspaceId: string,
  pullRequestNumber: number,
): QueryDescriptor<GitPullRequestDetailResult> {
  return {
    eventKinds: GIT_PULL_REQUEST_EVENT_KINDS,
    key: gitKeys.pullRequest(workspaceId, pullRequestNumber),
    fetch(source) {
      return source.getWorkspaceGitPullRequest(workspaceId, pullRequestNumber);
    },
    reduce(_current, event) {
      return invalidateGitWorkspaceQuery(event, workspaceId);
    },
  };
}

function createCurrentGitPullRequestQuery(
  workspaceId: string,
): QueryDescriptor<GitBranchPullRequestResult> {
  return {
    eventKinds: GIT_PULL_REQUEST_EVENT_KINDS,
    key: gitKeys.currentPullRequest(workspaceId),
    fetch(source) {
      return source.getWorkspaceCurrentGitPullRequest(workspaceId);
    },
    reduce(_current, event) {
      return invalidateGitWorkspaceQuery(event, workspaceId);
    },
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

    const timer = window.setInterval(() => {
      void refresh();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, refresh]);
}

export function useGitStatus(
  workspaceId: string | null,
  options?: GitQueryOptions,
): QueryResult<GitStatusResult | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createGitStatusQuery(workspaceId) : null),
    [workspaceId],
  );
  const query = useQuery(descriptor, {
    disabledData: undefined,
  });
  const polling = options?.polling ?? true;

  usePollingRefresh(query.refresh, Boolean(workspaceId) && polling, 3000);
  return query;
}

export function useGitLog(
  workspaceId: string | null,
  limit = 50,
): QueryResult<GitLogEntry[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createGitLogQuery(workspaceId, limit) : null),
    [limit, workspaceId],
  );
  const query = useQuery(descriptor, {
    disabledData: undefined,
  });

  usePollingRefresh(query.refresh, Boolean(workspaceId), 10000);
  return query;
}

export function useGitPullRequests(
  workspaceId: string | null,
): QueryResult<GitPullRequestListResult | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createGitPullRequestsQuery(workspaceId) : null),
    [workspaceId],
  );
  const query = useQuery(descriptor, {
    disabledData: undefined,
  });

  usePollingRefresh(query.refresh, Boolean(workspaceId), 15000);
  return query;
}

export function useGitPullRequest(
  workspaceId: string | null,
  pullRequestNumber: number | null,
): QueryResult<GitPullRequestDetailResult | undefined> {
  const descriptor = useMemo(
    () =>
      workspaceId && pullRequestNumber !== null
        ? createGitPullRequestQuery(workspaceId, pullRequestNumber)
        : null,
    [pullRequestNumber, workspaceId],
  );
  const query = useQuery(descriptor, {
    disabledData: undefined,
  });

  usePollingRefresh(query.refresh, Boolean(workspaceId) && pullRequestNumber !== null, 10000);
  return query;
}

export function useCurrentGitPullRequest(
  workspaceId: string | null,
): QueryResult<GitBranchPullRequestResult | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createCurrentGitPullRequestQuery(workspaceId) : null),
    [workspaceId],
  );
  const query = useQuery(descriptor, {
    disabledData: undefined,
  });

  usePollingRefresh(query.refresh, Boolean(workspaceId), 8000);
  return query;
}
