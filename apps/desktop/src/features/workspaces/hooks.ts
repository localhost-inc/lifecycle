import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { useMemo } from "react";
import type { QueryResult } from "../../query";
import { useQuery } from "../../query";
import type { ManifestStatus } from "../projects/api/projects";
import {
  normalizeWorkspaceRuntimeProjection,
  type WorkspaceFileReadResult,
  type WorkspaceFileTreeEntry,
  type WorkspaceSnapshotResult,
} from "./api";
import {
  buildWorkspaceActivityItems,
  type WorkspaceActivityItem,
} from "./state/workspace-activity";
import {
  createWorkspaceFileQuery,
  createWorkspaceFileTreeQuery,
  createWorkspaceManifestQuery,
  createWorkspaceQuery,
  createWorkspaceServicesQuery,
  createWorkspaceSnapshotQuery,
  createWorkspacesByProjectQuery,
} from "./state/workspace-query-descriptors";
import { workspaceKeys } from "./state/workspace-query-keys";
import {
  createWorkspaceRuntimeProjectionQuery,
  type EnvironmentTaskState,
  type ServiceLogState,
  type SetupStepState,
} from "./state/workspace-runtime-projection";

export {
  buildWorkspaceActivityItems,
  reduceWorkspaceActivity,
  type WorkspaceActivityItem,
} from "./state/workspace-activity";
export {
  createWorkspaceManifestQuery,
  createWorkspaceQuery,
  createWorkspaceServicesQuery,
  createWorkspaceSnapshotQuery,
  createWorkspacesByProjectQuery,
  reduceWorkspaceRecord,
  reduceWorkspaceServices,
  reduceWorkspaceSnapshot,
  reduceWorkspacesByProject,
} from "./state/workspace-query-descriptors";
export { workspaceKeys } from "./state/workspace-query-keys";
export {
  reduceWorkspaceRuntimeProjection,
  type EnvironmentTaskState,
  type ServiceLogLine,
  type ServiceLogState,
  type SetupStepState,
} from "./state/workspace-runtime-projection";

export function useWorkspacesByProject() {
  return useQuery(createWorkspacesByProjectQuery(), {
    disabledData: undefined,
  });
}

export function useProjectWorkspaces(
  projectId: string | null,
): QueryResult<WorkspaceRecord[] | undefined> {
  const query = useWorkspacesByProject();

  return useMemo(
    () => ({
      ...query,
      data: projectId && query.data ? (query.data[projectId] ?? []) : undefined,
    }),
    [projectId, query],
  );
}

export function useWorkspace(workspaceId: string | null): QueryResult<WorkspaceRecord | null> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
}

export function useWorkspaceSnapshot(
  workspaceId: string | null,
): QueryResult<WorkspaceSnapshotResult | null> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceSnapshotQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
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

  return useQuery(descriptor, {
    disabledData: null,
  });
}

export function useWorkspaceServices(
  workspaceId: string | null,
): QueryResult<ServiceRecord[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceServicesQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: undefined,
  });
}

export function useWorkspaceFile(
  workspaceId: string | null,
  filePath: string | null,
): QueryResult<WorkspaceFileReadResult | null> {
  const descriptor = useMemo(
    () => (workspaceId && filePath ? createWorkspaceFileQuery(workspaceId, filePath) : null),
    [filePath, workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
}

export function useWorkspaceFileTree(
  workspaceId: string | null,
): QueryResult<WorkspaceFileTreeEntry[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceFileTreeQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: undefined,
  });
}

function useWorkspaceRuntimeProjection(workspaceId: string | null) {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceRuntimeProjectionQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: undefined,
  });
}

export function useWorkspaceSetup(
  workspaceId: string | null,
): QueryResult<SetupStepState[] | undefined> {
  const query = useWorkspaceRuntimeProjection(workspaceId);

  return useMemo(
    () => ({
      ...query,
      data: query.data ? normalizeWorkspaceRuntimeProjection(query.data).setup : undefined,
    }),
    [query],
  );
}

export function useWorkspaceEnvironmentTasks(
  workspaceId: string | null,
): QueryResult<EnvironmentTaskState[] | undefined> {
  const query = useWorkspaceRuntimeProjection(workspaceId);

  return useMemo(
    () => ({
      ...query,
      data: query.data
        ? normalizeWorkspaceRuntimeProjection(query.data).environmentTasks
        : undefined,
    }),
    [query],
  );
}

export function useWorkspaceServiceLogs(
  workspaceId: string | null,
): QueryResult<ServiceLogState[] | undefined> {
  const query = useWorkspaceRuntimeProjection(workspaceId);

  return useMemo(
    () => ({
      ...query,
      data: query.data
        ? normalizeWorkspaceRuntimeProjection(query.data).serviceLogs.map((log) => ({
            serviceName: log.service_name,
            lines: log.lines,
          }))
        : undefined,
    }),
    [query],
  );
}

export function useWorkspaceActivity(
  workspaceId: string | null,
): QueryResult<WorkspaceActivityItem[] | undefined> {
  const query = useWorkspaceRuntimeProjection(workspaceId);

  return useMemo(
    () => ({
      ...query,
      data: query.data
        ? buildWorkspaceActivityItems(normalizeWorkspaceRuntimeProjection(query.data).activity)
        : undefined,
    }),
    [query],
  );
}
