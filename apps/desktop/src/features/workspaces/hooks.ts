import type { LifecycleEventKind, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { useMemo } from "react";
import type { QueryDescriptor, QueryResult } from "../../query";
import { useQuery } from "../../query";

export interface SetupStepState {
  name: string;
  output: string[];
  status: "pending" | "running" | "completed" | "failed" | "timeout";
}

export const workspaceKeys = {
  byProject: () => ["workspaces", "by-project"] as const,
  detail: (workspaceId: string) => ["workspace", workspaceId] as const,
  services: (workspaceId: string) => ["workspace-services", workspaceId] as const,
  setup: (workspaceId: string) => ["workspace-setup", workspaceId] as const,
};

const WORKSPACES_BY_PROJECT_EVENT_KINDS = [
  "workspace.renamed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_EVENT_KINDS = [
  "workspace.renamed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_SERVICE_EVENT_KINDS = [
  "service.status_changed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_SETUP_EVENT_KINDS = [
  "workspace.status_changed",
  "workspace.deleted",
  "setup.step_progress",
] as const satisfies readonly LifecycleEventKind[];

const workspacesByProjectQuery: QueryDescriptor<Record<string, WorkspaceRecord[]>> = {
  eventKinds: WORKSPACES_BY_PROJECT_EVENT_KINDS,
  key: workspaceKeys.byProject(),
  fetch(source) {
    return source.listWorkspacesByProject();
  },
  reduce(current, event) {
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
  },
};

function createWorkspaceQuery(workspaceId: string): QueryDescriptor<WorkspaceRecord | null> {
  return {
    eventKinds: WORKSPACE_EVENT_KINDS,
    key: workspaceKeys.detail(workspaceId),
    fetch(source) {
      return source.getWorkspace(workspaceId);
    },
    reduce(current, event) {
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
    },
  };
}

function createWorkspaceServicesQuery(workspaceId: string): QueryDescriptor<ServiceRecord[]> {
  return {
    eventKinds: WORKSPACE_SERVICE_EVENT_KINDS,
    key: workspaceKeys.services(workspaceId),
    fetch(source) {
      return source.getWorkspaceServices(workspaceId);
    },
    reduce(current, event) {
      if (
        (event.kind === "workspace.status_changed" || event.kind === "workspace.deleted") &&
        event.workspace_id === workspaceId
      ) {
        return { kind: "invalidate" };
      }

      if (event.kind !== "service.status_changed" || event.workspace_id !== workspaceId) {
        return { kind: "none" };
      }

      if (!current) {
        return { kind: "invalidate" };
      }

      const next = current.map((service) =>
        service.service_name === event.service_name
          ? {
              ...service,
              status: event.status,
              status_reason: event.status_reason,
            }
          : service,
      );
      const found = next.some((service) => service.service_name === event.service_name);

      if (!found) {
        return { kind: "invalidate" };
      }

      return { kind: "replace", data: next };
    },
  };
}

function createWorkspaceSetupQuery(workspaceId: string): QueryDescriptor<SetupStepState[]> {
  return {
    eventKinds: WORKSPACE_SETUP_EVENT_KINDS,
    key: workspaceKeys.setup(workspaceId),
    async fetch() {
      return [];
    },
    reduce(current, event) {
      if (event.kind === "workspace.deleted" && event.workspace_id === workspaceId) {
        return { kind: "replace", data: [] };
      }

      if (
        event.kind === "workspace.status_changed" &&
        event.workspace_id === workspaceId &&
        event.status === "starting"
      ) {
        return { kind: "replace", data: [] };
      }

      if (event.kind !== "setup.step_progress" || event.workspace_id !== workspaceId) {
        return { kind: "none" };
      }

      const previous = current ?? [];
      const existing = previous.find((step) => step.name === event.step_name);
      const steps = existing
        ? previous
        : [...previous, { name: event.step_name, output: [], status: "pending" as const }];

      return {
        kind: "replace",
        data: steps.map((step) => {
          if (step.name !== event.step_name) {
            return step;
          }

          switch (event.event_kind) {
            case "started":
              return { ...step, status: "running" as const };
            case "stdout":
            case "stderr":
              return { ...step, output: [...step.output, event.data ?? ""] };
            case "completed":
              return { ...step, status: "completed" as const };
            case "failed":
              return {
                ...step,
                output: [...step.output, event.data ?? ""],
                status: "failed" as const,
              };
            case "timeout":
              return { ...step, status: "timeout" as const };
          }
        }),
      };
    },
  };
}

export function useWorkspacesByProject() {
  return useQuery(workspacesByProjectQuery, {
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

export function useWorkspaceSetup(
  workspaceId: string | null,
): QueryResult<SetupStepState[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceSetupQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: undefined,
  });
}
