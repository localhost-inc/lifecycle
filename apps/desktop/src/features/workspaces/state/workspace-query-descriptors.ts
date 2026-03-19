import type {
  LifecycleEvent,
  LifecycleEventKind,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { QueryDescriptor, QueryUpdate } from "../../../query";
import type { ManifestStatus } from "../../projects/api/projects";
import { reduceWorkspaceTerminals } from "../../terminals/hooks";
import type {
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceSnapshotResult,
} from "../api";
import { workspaceKeys } from "./workspace-query-keys";

const WORKSPACES_BY_PROJECT_EVENT_KINDS = [
  "git.head_changed",
  "workspace.manifest_synced",
  "workspace.renamed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_EVENT_KINDS = [
  "git.head_changed",
  "workspace.manifest_synced",
  "workspace.renamed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_SERVICE_EVENT_KINDS = [
  "service.configuration_changed",
  "service.status_changed",
  "workspace.manifest_synced",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_SNAPSHOT_EVENT_KINDS = [
  "git.head_changed",
  "service.configuration_changed",
  "service.status_changed",
  "terminal.created",
  "terminal.updated",
  "terminal.status_changed",
  "terminal.renamed",
  "workspace.manifest_synced",
  "workspace.renamed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];

export function createWorkspacesByProjectQuery(): QueryDescriptor<
  Record<string, WorkspaceRecord[]>
> {
  return {
    eventKinds: WORKSPACES_BY_PROJECT_EVENT_KINDS,
    key: workspaceKeys.byProject(),
    fetch(source) {
      return source.listWorkspacesByProject();
    },
    reduce: reduceWorkspacesByProject,
  };
}

export function createWorkspaceQuery(workspaceId: string): QueryDescriptor<WorkspaceRecord | null> {
  return {
    eventKinds: WORKSPACE_EVENT_KINDS,
    key: workspaceKeys.detail(workspaceId),
    fetch(source) {
      return source.getWorkspace(workspaceId);
    },
    reduce(current, event) {
      return reduceWorkspaceRecord(current, event, workspaceId);
    },
  };
}

export function reduceWorkspacesByProject(
  current: Record<string, WorkspaceRecord[]> | undefined,
  event: LifecycleEvent,
): QueryUpdate<Record<string, WorkspaceRecord[]>> {
  if (event.kind === "workspace.manifest_synced" && current) {
    let changed = false;
    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.map((workspace) => {
          if (workspace.id !== event.workspace_id) {
            return workspace;
          }

          found = true;
          if (workspace.manifest_fingerprint === event.manifest_fingerprint) {
            return workspace;
          }

          changed = true;
          return {
            ...workspace,
            manifest_fingerprint: event.manifest_fingerprint,
          };
        }),
      ]),
    );

    if (!found) {
      return { kind: "none" };
    }

    return changed ? { kind: "replace", data: next } : { kind: "none" };
  }

  if (event.kind === "workspace.renamed" && current) {
    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.map((workspace) => {
          if (workspace.id !== event.workspace_id) {
            return workspace;
          }

          found = true;
          return {
            ...workspace,
            name: event.name,
            source_ref: event.source_ref,
            worktree_path: event.worktree_path,
          };
        }),
      ]),
    );

    return found ? { kind: "replace", data: next } : { kind: "invalidate" };
  }

  if (event.kind === "git.head_changed" && current) {
    let changed = false;
    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.map((workspace) => {
          if (workspace.id !== event.workspace_id) {
            return workspace;
          }

          found = true;
          const nextSourceRef = event.branch ?? workspace.source_ref;
          const nextGitSha = event.head_sha;
          if (workspace.source_ref === nextSourceRef && workspace.git_sha === nextGitSha) {
            return workspace;
          }

          changed = true;
          return {
            ...workspace,
            source_ref: nextSourceRef,
            git_sha: nextGitSha,
          };
        }),
      ]),
    );

    if (!found) {
      return { kind: "none" };
    }

    return changed ? { kind: "replace", data: next } : { kind: "none" };
  }

  if (event.kind !== "workspace.status_changed" || !current) {
    if (event.kind !== "workspace.deleted" || !current) {
      return { kind: "none" };
    }

    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.filter((workspace) => {
          const matches = workspace.id === event.workspace_id;
          if (matches) {
            found = true;
          }
          return !matches;
        }),
      ]),
    );

    return found ? { kind: "replace", data: next } : { kind: "none" };
  }

  let changed = false;
  let found = false;
  const next = Object.fromEntries(
    Object.entries(current).map(([projectId, workspaces]) => [
      projectId,
      workspaces.map((workspace) => {
        if (workspace.id !== event.workspace_id) {
          return workspace;
        }

        found = true;
        changed = true;
        return {
          ...workspace,
          failure_reason: event.failure_reason,
          status: event.status,
        };
      }),
    ]),
  );

  if (!found) {
    return { kind: "invalidate" };
  }

  return changed ? { kind: "replace", data: next } : { kind: "none" };
}

export function reduceWorkspaceRecord(
  current: WorkspaceRecord | null | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<WorkspaceRecord | null> {
  if (event.kind === "workspace.manifest_synced" && event.workspace_id === workspaceId) {
    if (!current) {
      return { kind: "invalidate" };
    }

    if (current.manifest_fingerprint === event.manifest_fingerprint) {
      return { kind: "none" };
    }

    return {
      kind: "replace",
      data: {
        ...current,
        manifest_fingerprint: event.manifest_fingerprint,
      },
    };
  }

  if (event.kind === "git.head_changed" && event.workspace_id === workspaceId) {
    if (!current) {
      return { kind: "invalidate" };
    }

    const nextSourceRef = event.branch ?? current.source_ref;
    const nextGitSha = event.head_sha;
    if (current.source_ref === nextSourceRef && current.git_sha === nextGitSha) {
      return { kind: "none" };
    }

    return {
      kind: "replace",
      data: {
        ...current,
        source_ref: nextSourceRef,
        git_sha: nextGitSha,
      },
    };
  }

  if (event.kind !== "workspace.status_changed" || event.workspace_id !== workspaceId) {
    if (event.kind === "workspace.renamed" && event.workspace_id === workspaceId) {
      if (!current) {
        return { kind: "invalidate" };
      }

      return {
        kind: "replace",
        data: {
          ...current,
          name: event.name,
          source_ref: event.source_ref,
          worktree_path: event.worktree_path,
        },
      };
    }

    if (event.kind === "workspace.deleted" && event.workspace_id === workspaceId) {
      return {
        kind: "replace",
        data: null,
      };
    }

    return { kind: "none" };
  }

  if (!current) {
    return { kind: "invalidate" };
  }

  return {
    kind: "replace",
    data: {
      ...current,
      failure_reason: event.failure_reason,
      status: event.status,
    },
  };
}

export function createWorkspaceSnapshotQuery(
  workspaceId: string,
): QueryDescriptor<WorkspaceSnapshotResult> {
  return {
    eventKinds: WORKSPACE_SNAPSHOT_EVENT_KINDS,
    key: workspaceKeys.snapshot(workspaceId),
    fetch(source) {
      return source.getWorkspaceSnapshot(workspaceId);
    },
    reduce(current, event) {
      return reduceWorkspaceSnapshot(current, event, workspaceId);
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

export function reduceWorkspaceSnapshot(
  current: WorkspaceSnapshotResult | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<WorkspaceSnapshotResult> {
  if (!current) {
    if (event.kind === "workspace.deleted" && event.workspace_id === workspaceId) {
      return {
        kind: "replace",
        data: {
          services: [],
          terminals: [],
          workspace: null,
        },
      };
    }

    return { kind: "invalidate" };
  }

  const workspaceUpdate = reduceWorkspaceRecord(current.workspace, event, workspaceId);
  const servicesUpdate = reduceWorkspaceServices(current.services, event, workspaceId);
  const terminalsUpdate = reduceWorkspaceTerminals(current.terminals, event, workspaceId);

  if (
    workspaceUpdate.kind === "invalidate" ||
    servicesUpdate.kind === "invalidate" ||
    terminalsUpdate.kind === "invalidate"
  ) {
    return { kind: "invalidate" };
  }

  if (
    workspaceUpdate.kind === "none" &&
    servicesUpdate.kind === "none" &&
    terminalsUpdate.kind === "none"
  ) {
    return { kind: "none" };
  }

  return {
    kind: "replace",
    data: {
      services: servicesUpdate.kind === "replace" ? servicesUpdate.data : current.services,
      terminals: terminalsUpdate.kind === "replace" ? terminalsUpdate.data : current.terminals,
      workspace: workspaceUpdate.kind === "replace" ? workspaceUpdate.data : current.workspace,
    },
  };
}

export function createWorkspaceServicesQuery(
  workspaceId: string,
): QueryDescriptor<ServiceRecord[]> {
  return {
    eventKinds: WORKSPACE_SERVICE_EVENT_KINDS,
    key: workspaceKeys.services(workspaceId),
    fetch(source) {
      return source.getWorkspaceServices(workspaceId);
    },
    reduce(current, event) {
      return reduceWorkspaceServices(current, event, workspaceId);
    },
  };
}

export function reduceWorkspaceServices(
  current: ServiceRecord[] | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<ServiceRecord[]> {
  if (event.kind === "workspace.manifest_synced" && event.workspace_id === workspaceId) {
    return { kind: "replace", data: event.services };
  }

  if (
    (event.kind === "workspace.status_changed" || event.kind === "workspace.deleted") &&
    event.workspace_id === workspaceId
  ) {
    return { kind: "invalidate" };
  }

  if (event.kind !== "service.status_changed" && event.kind !== "service.configuration_changed") {
    return { kind: "none" };
  }

  if (event.workspace_id !== workspaceId) {
    return { kind: "none" };
  }

  if (!current) {
    return { kind: "invalidate" };
  }

  const serviceName =
    event.kind === "service.status_changed" ? event.service_name : event.service.service_name;
  let found = false;
  const next = current.map((service) => {
    if (service.service_name !== serviceName) {
      return service;
    }

    found = true;
    if (event.kind === "service.status_changed") {
      return service;
    }

    return event.service;
  });

  if (!found) {
    return { kind: "invalidate" };
  }

  if (event.kind === "service.status_changed") {
    return { kind: "invalidate" };
  }

  return { kind: "replace", data: next };
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
