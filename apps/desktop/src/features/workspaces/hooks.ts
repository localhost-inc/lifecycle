import type { LifecycleEvent, ServiceRecord } from "@lifecycle/contracts";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { ManifestStatus } from "@/features/projects/api/projects";
import { readManifest } from "@/features/projects/api/projects";
import type {
  ServiceLogSnapshot,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
} from "@/features/workspaces/api";
import {
  getWorkspaceActivity,
  getWorkspaceServiceLogs,
  getWorkspaceServices,
  listWorkspaceFiles,
  readWorkspaceFile,
} from "@/features/workspaces/api";
import { subscribeToLifecycleEvents } from "@/features/events";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { useClient } from "@/store";

// Entity-data hooks are provided by TanStack DB collections via @/store
export { useWorkspacesByProject, useWorkspace } from "@/store";

/**
 * Returns services for a workspace with preview_url enriched by the Rust backend.
 * Subscribes to service lifecycle events so the list stays current.
 */
export function useWorkspaceServices(workspaceId: string): ServiceRecord[] {
  const client = useClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void subscribeToLifecycleEvents(
      ["service.status.changed", "service.process.exited"],
      () => {
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.services(workspaceId) });
      },
    ).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient, workspaceId]);

  const { data } = useQuery({
    queryKey: workspaceKeys.services(workspaceId),
    queryFn: () => getWorkspaceServices(client, workspaceId),
  });

  return useMemo(() => data ?? [], [data]);
}

export function useWorkspaceManifest(
  workspaceId: string | null,
  worktreePath: string | null,
): UseQueryResult<ManifestStatus> {
  const client = useClient();
  const enabled = workspaceId !== null && worktreePath !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.manifest(workspaceId)
      : ["workspace-manifest", "disabled"],
    queryFn: () => readManifest(client, worktreePath!),
    enabled,
  });
}

export function useWorkspaceFile(
  workspaceId: string | null,
  filePath: string | null,
): UseQueryResult<WorkspaceFileReadResult> {
  const client = useClient();
  const enabled = workspaceId !== null && filePath !== null;

  return useQuery({
    queryKey:
      workspaceId && filePath
        ? workspaceKeys.file(workspaceId, filePath)
        : ["workspace-file", "disabled"],
    queryFn: () => readWorkspaceFile(client, workspaceId!, filePath!),
    enabled,
  });
}

export function useWorkspaceFileTree(
  workspaceId: string | null,
): UseQueryResult<WorkspaceFileTreeEntry[]> {
  const client = useClient();
  const enabled = workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.fileTree(workspaceId)
      : ["workspace-file-tree", "disabled"],
    queryFn: () => listWorkspaceFiles(client, workspaceId!),
    enabled,
  });
}

export function useWorkspaceServiceLogs(
  workspaceId: string | null,
  options?: { enabled?: boolean },
): UseQueryResult<ServiceLogSnapshot[]> {
  const client = useClient();
  const enabled = (options?.enabled ?? true) && workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.serviceLogs(workspaceId)
      : ["workspace-service-logs", "disabled"],
    queryFn: () => getWorkspaceServiceLogs(client, workspaceId!),
    enabled,
  });
}

export function useWorkspaceActivity(
  workspaceId: string | null,
): UseQueryResult<LifecycleEvent[]> {
  const client = useClient();
  const enabled = workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.activity(workspaceId)
      : ["workspace-activity", "disabled"],
    queryFn: () => getWorkspaceActivity(client, workspaceId!),
    enabled,
  });
}
