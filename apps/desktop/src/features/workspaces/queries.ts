import type {
  LifecycleEvent,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { QueryDescriptor } from "@/query";
import type { ManifestStatus } from "@/features/projects/api/projects";
import type { ServiceLogSnapshot, WorkspaceFileReadResult, WorkspaceFileTreeEntry } from "@/features/workspaces/api";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";

export function createWorkspacesByProjectQuery(): QueryDescriptor<
  Record<string, WorkspaceRecord[]>
> {
  return {
    key: workspaceKeys.byProject(),
    fetch(source) {
      return source.listWorkspacesByProject();
    },
  };
}

export function createWorkspaceQuery(workspaceId: string): QueryDescriptor<WorkspaceRecord | null> {
  return {
    key: workspaceKeys.detail(workspaceId),
    fetch(source) {
      return source.getWorkspace(workspaceId);
    },
  };
}

export function createWorkspaceActivityQuery(
  workspaceId: string,
): QueryDescriptor<LifecycleEvent[]> {
  return {
    key: workspaceKeys.activity(workspaceId),
    fetch(source) {
      return source.getWorkspaceActivity(workspaceId);
    },
  };
}

export function createWorkspaceServiceLogsQuery(
  workspaceId: string,
): QueryDescriptor<ServiceLogSnapshot[]> {
  return {
    key: workspaceKeys.serviceLogs(workspaceId),
    fetch(source) {
      return source.getWorkspaceServiceLogs(workspaceId);
    },
  };
}

export function createWorkspaceManifestQuery(
  workspaceId: string,
  worktreePath: string,
): QueryDescriptor<ManifestStatus> {
  return {
    key: workspaceKeys.manifest(workspaceId),
    fetch(source) {
      return source.readManifest(worktreePath);
    },
  };
}

export function createWorkspaceServicesQuery(
  workspaceId: string,
): QueryDescriptor<ServiceRecord[]> {
  return {
    key: workspaceKeys.services(workspaceId),
    fetch(source) {
      return source.getWorkspaceServices(workspaceId);
    },
  };
}

export function createWorkspaceFileQuery(
  workspaceId: string,
  filePath: string,
): QueryDescriptor<WorkspaceFileReadResult> {
  return {
    key: workspaceKeys.file(workspaceId, filePath),
    fetch(source) {
      return source.getWorkspaceFile(workspaceId, filePath);
    },
  };
}

export function createWorkspaceFileTreeQuery(
  workspaceId: string,
): QueryDescriptor<WorkspaceFileTreeEntry[]> {
  return {
    key: workspaceKeys.fileTree(workspaceId),
    fetch(source) {
      return source.listWorkspaceFiles(workspaceId);
    },
  };
}
