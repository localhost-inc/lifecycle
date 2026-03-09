import type { GitLogEntry, GitStatusResult } from "@lifecycle/contracts";
import { useEffect, useMemo } from "react";
import type { QueryDescriptor, QueryResult } from "../../query";
import { useQuery } from "../../query";

export const gitKeys = {
  log: (workspaceId: string, limit: number) => ["workspace-git-log", workspaceId, limit] as const,
  status: (workspaceId: string) => ["workspace-git-status", workspaceId] as const,
};

interface GitQueryOptions {
  polling?: boolean;
}

function createGitStatusQuery(workspaceId: string): QueryDescriptor<GitStatusResult> {
  return {
    key: gitKeys.status(workspaceId),
    fetch(source) {
      return source.getWorkspaceGitStatus(workspaceId);
    },
  };
}

function createGitLogQuery(workspaceId: string, limit: number): QueryDescriptor<GitLogEntry[]> {
  return {
    key: gitKeys.log(workspaceId, limit),
    fetch(source) {
      return source.getWorkspaceGitLog(workspaceId, limit);
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
