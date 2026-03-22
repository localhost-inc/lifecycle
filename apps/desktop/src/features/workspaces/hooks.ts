import type { LifecycleEvent } from "@lifecycle/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
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
  listWorkspaceFiles,
  readWorkspaceFile,
} from "@/features/workspaces/api";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { useRuntime } from "@/store";

// Entity-data hooks are provided by TanStack DB collections via @/store
export { useWorkspacesByProject, useWorkspace, useWorkspaceServices } from "@/store";

export function useWorkspaceManifest(
  workspaceId: string | null,
  worktreePath: string | null,
): UseQueryResult<ManifestStatus> {
  const runtime = useRuntime();
  const enabled = workspaceId !== null && worktreePath !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.manifest(workspaceId)
      : ["workspace-manifest", "disabled"],
    queryFn: () => readManifest(runtime, worktreePath!),
    enabled,
  });
}

export function useWorkspaceFile(
  workspaceId: string | null,
  filePath: string | null,
): UseQueryResult<WorkspaceFileReadResult> {
  const runtime = useRuntime();
  const enabled = workspaceId !== null && filePath !== null;

  return useQuery({
    queryKey:
      workspaceId && filePath
        ? workspaceKeys.file(workspaceId, filePath)
        : ["workspace-file", "disabled"],
    queryFn: () => readWorkspaceFile(runtime, workspaceId!, filePath!),
    enabled,
  });
}

export function useWorkspaceFileTree(
  workspaceId: string | null,
): UseQueryResult<WorkspaceFileTreeEntry[]> {
  const runtime = useRuntime();
  const enabled = workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.fileTree(workspaceId)
      : ["workspace-file-tree", "disabled"],
    queryFn: () => listWorkspaceFiles(runtime, workspaceId!),
    enabled,
  });
}

export function useWorkspaceServiceLogs(
  workspaceId: string | null,
  options?: { enabled?: boolean },
): UseQueryResult<ServiceLogSnapshot[]> {
  const runtime = useRuntime();
  const enabled = (options?.enabled ?? true) && workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.serviceLogs(workspaceId)
      : ["workspace-service-logs", "disabled"],
    queryFn: () => getWorkspaceServiceLogs(runtime, workspaceId!),
    enabled,
  });
}

export function useWorkspaceActivity(
  workspaceId: string | null,
): UseQueryResult<LifecycleEvent[]> {
  const runtime = useRuntime();
  const enabled = workspaceId !== null;

  return useQuery({
    queryKey: workspaceId
      ? workspaceKeys.activity(workspaceId)
      : ["workspace-activity", "disabled"],
    queryFn: () => getWorkspaceActivity(runtime, workspaceId!),
    enabled,
  });
}
