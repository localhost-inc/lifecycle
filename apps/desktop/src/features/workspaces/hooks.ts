import type {
  LifecycleEvent,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { useMemo } from "react";
import type { QueryResult } from "@/query";
import { useQuery } from "@/query";
import type { ManifestStatus } from "@/features/projects/api/projects";
import type {
  ServiceLogSnapshot,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
} from "@/features/workspaces/api";
import {
  createWorkspaceActivityQuery,
  createWorkspaceFileQuery,
  createWorkspaceFileTreeQuery,
  createWorkspaceManifestQuery,
  createWorkspaceQuery,
  createWorkspaceServiceLogsQuery,
  createWorkspaceServicesQuery,
  createWorkspacesByProjectQuery,
} from "@/features/workspaces/queries";

export function useWorkspacesByProject() {
  return useQuery(createWorkspacesByProjectQuery());
}

export function useWorkspace(workspaceId: string | null): QueryResult<WorkspaceRecord | null> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor);
}

export function useWorkspaceManifest(
  workspaceId: string | null,
  worktreePath: string | null,
): QueryResult<ManifestStatus | null> {
  const descriptor = useMemo(
    () =>
      workspaceId && worktreePath ? createWorkspaceManifestQuery(workspaceId, worktreePath) : null,
    [workspaceId, worktreePath],
  );

  return useQuery(descriptor);
}

export function useWorkspaceServices(
  workspaceId: string,
): QueryResult<ServiceRecord[]> {
  const descriptor = useMemo(() => createWorkspaceServicesQuery(workspaceId), [workspaceId]);

  return useQuery(descriptor);
}

export function useWorkspaceFile(
  workspaceId: string | null,
  filePath: string | null,
): QueryResult<WorkspaceFileReadResult | null> {
  const descriptor = useMemo(
    () => (workspaceId && filePath ? createWorkspaceFileQuery(workspaceId, filePath) : null),
    [filePath, workspaceId],
  );

  return useQuery(descriptor);
}

export function useWorkspaceFileTree(
  workspaceId: string | null,
): QueryResult<WorkspaceFileTreeEntry[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceFileTreeQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor);
}

export function useWorkspaceServiceLogs(
  workspaceId: string | null,
  options?: { enabled?: boolean },
): QueryResult<ServiceLogSnapshot[] | undefined> {
  const enabled = options?.enabled ?? true;
  const descriptor = useMemo(
    () => (workspaceId && enabled ? createWorkspaceServiceLogsQuery(workspaceId) : null),
    [enabled, workspaceId],
  );

  return useQuery(descriptor);
}

export function useWorkspaceActivity(
  workspaceId: string | null,
): QueryResult<LifecycleEvent[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceActivityQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor);
}
