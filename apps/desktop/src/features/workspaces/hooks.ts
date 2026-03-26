import type { LifecycleEvent, ServiceRecord, WorkspaceHost } from "@lifecycle/contracts";
import type {
  ServiceLogSnapshot,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
} from "@lifecycle/workspace/client";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { ManifestStatus } from "@/features/projects/api/projects";
import { readManifest } from "@/features/projects/api/projects";
import { subscribeToLifecycleEvents } from "@/features/events";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import {
  useOptionalWorkspaceHostClient,
  useWorkspaceHostClient,
} from "@lifecycle/workspace/client/react";

// Entity-data hooks are provided by TanStack DB collections via @/store
export { useWorkspacesByProject, useWorkspace } from "@/store";

/**
 * Returns services for a workspace with preview_url enriched by the Rust backend.
 * Subscribes to service lifecycle events so the list stays current.
 */
export function useWorkspaceServices(
  workspaceId: string,
  workspaceHost: WorkspaceHost,
): ServiceRecord[] {
  const client = useWorkspaceHostClient(workspaceHost);
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void subscribeToLifecycleEvents(["service.status.changed", "service.process.exited"], () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.services(workspaceId) });
    }).then((cleanup) => {
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
    queryFn: () => client.getServices(workspaceId),
  });

  return useMemo(() => data ?? [], [data]);
}

export function useWorkspaceManifest(
  workspaceId: string | null,
  worktreePath: string | null,
): UseQueryResult<ManifestStatus> {
  const enabled = workspaceId !== null && worktreePath !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.manifest(workspaceId)
      : ["workspace-manifest", "disabled"],
    queryFn: () => readManifest(worktreePath!),
    enabled,
  });
}

export function useWorkspaceFile(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
  filePath: string | null,
): UseQueryResult<WorkspaceFileReadResult> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled = client !== null && workspaceId !== null && filePath !== null;

  return useQuery({
    queryKey:
      workspaceId && filePath
        ? workspaceKeys.file(workspaceId, filePath)
        : ["workspace-file", "disabled"],
    queryFn: () => client!.readFile(workspaceId!, filePath!),
    enabled,
  });
}

export function useWorkspaceFileTree(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
): UseQueryResult<WorkspaceFileTreeEntry[]> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled = client !== null && workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.fileTree(workspaceId)
      : ["workspace-file-tree", "disabled"],
    queryFn: () => client!.listFiles(workspaceId!),
    enabled,
  });
}

export function useWorkspaceServiceLogs(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
  options?: { enabled?: boolean },
): UseQueryResult<ServiceLogSnapshot[]> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled = (options?.enabled ?? true) && client !== null && workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.serviceLogs(workspaceId)
      : ["workspace-service-logs", "disabled"],
    queryFn: () => client!.getServiceLogs(workspaceId!),
    enabled,
  });
}

export function useWorkspaceActivity(
  workspaceId: string | null,
  workspaceHost: WorkspaceHost | null,
): UseQueryResult<LifecycleEvent[]> {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const enabled = client !== null && workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.activity(workspaceId)
      : ["workspace-activity", "disabled"],
    queryFn: () => client!.getActivity(workspaceId!),
    enabled,
  });
}
