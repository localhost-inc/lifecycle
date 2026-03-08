import { useMemo } from "react";
import type { QueryDescriptor, StoreQueryResult } from "../../store";
import { useStoreQuery } from "../../store";
import type { ServiceRow, WorkspaceRow } from "./api";

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

const workspacesByProjectQuery: QueryDescriptor<Record<string, WorkspaceRow[]>> = {
  key: workspaceKeys.byProject(),
  fetch(source) {
    return source.listWorkspacesByProject();
  },
  reduce(current, event) {
    if (event.kind === "workspaces-invalidated") {
      return { type: "invalidate" };
    }

    if (event.kind === "workspace-renamed" && current) {
      let found = false;
      const next = Object.fromEntries(
        Object.entries(current).map(([projectId, workspaces]) => [
          projectId,
          workspaces.map((workspace) => {
            if (workspace.id !== event.workspaceId) {
              return workspace;
            }

            found = true;
            return {
              ...workspace,
              name: event.name,
              worktree_path: event.worktreePath,
            };
          }),
        ]),
      );

      return found ? { type: "replace", data: next } : { type: "invalidate" };
    }

    if (event.kind !== "workspace-status-changed" || !current) {
      return { type: "none" };
    }

    let changed = false;
    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.map((workspace) => {
          if (workspace.id !== event.workspaceId) {
            return workspace;
          }

          found = true;
          changed = true;
          return {
            ...workspace,
            failure_reason: event.failureReason,
            status: event.status,
          };
        }),
      ]),
    );

    if (!found) {
      return { type: "invalidate" };
    }

    return changed ? { type: "replace", data: next } : { type: "none" };
  },
};

function createWorkspaceQuery(workspaceId: string): QueryDescriptor<WorkspaceRow | null> {
  return {
    key: workspaceKeys.detail(workspaceId),
    fetch(source) {
      return source.getWorkspace(workspaceId);
    },
    reduce(current, event) {
      if (
        event.kind === "workspaces-invalidated" &&
        (!event.workspaceId || event.workspaceId === workspaceId)
      ) {
        return { type: "invalidate" };
      }

      if (event.kind !== "workspace-status-changed" || event.workspaceId !== workspaceId) {
        if (event.kind === "workspace-renamed" && event.workspaceId === workspaceId) {
          if (!current) {
            return { type: "invalidate" };
          }

          return {
            type: "replace",
            data: {
              ...current,
              name: event.name,
              worktree_path: event.worktreePath,
            },
          };
        }

        return { type: "none" };
      }

      if (!current) {
        return { type: "invalidate" };
      }

      return {
        type: "replace",
        data: {
          ...current,
          failure_reason: event.failureReason,
          status: event.status,
        },
      };
    },
  };
}

function createWorkspaceServicesQuery(workspaceId: string): QueryDescriptor<ServiceRow[]> {
  return {
    key: workspaceKeys.services(workspaceId),
    fetch(source) {
      return source.getWorkspaceServices(workspaceId);
    },
    reduce(current, event) {
      if (
        event.kind === "workspaces-invalidated" &&
        (!event.workspaceId || event.workspaceId === workspaceId)
      ) {
        return { type: "invalidate" };
      }

      if (event.kind !== "workspace-service-status-changed" || event.workspaceId !== workspaceId) {
        return { type: "none" };
      }

      if (!current) {
        return { type: "invalidate" };
      }

      const next = current.map((service) =>
        service.service_name === event.serviceName
          ? {
              ...service,
              status: event.status,
              status_reason: event.statusReason,
            }
          : service,
      );
      const found = next.some((service) => service.service_name === event.serviceName);

      if (!found) {
        return { type: "invalidate" };
      }

      return { type: "replace", data: next };
    },
  };
}

function createWorkspaceSetupQuery(workspaceId: string): QueryDescriptor<SetupStepState[]> {
  return {
    key: workspaceKeys.setup(workspaceId),
    async fetch() {
      return [];
    },
    reduce(current, event) {
      if (
        event.kind === "workspaces-invalidated" &&
        (!event.workspaceId || event.workspaceId === workspaceId)
      ) {
        return { type: "invalidate" };
      }

      if (
        event.kind === "workspace-status-changed" &&
        event.workspaceId === workspaceId &&
        event.status === "starting"
      ) {
        return { type: "replace", data: [] };
      }

      if (event.kind !== "workspace-setup-progress" || event.workspaceId !== workspaceId) {
        return { type: "none" };
      }

      const previous = current ?? [];
      const existing = previous.find((step) => step.name === event.stepName);
      const steps = existing
        ? previous
        : [...previous, { name: event.stepName, output: [], status: "pending" as const }];

      return {
        type: "replace",
        data: steps.map((step) => {
          if (step.name !== event.stepName) {
            return step;
          }

          switch (event.eventType) {
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
  return useStoreQuery(workspacesByProjectQuery, {
    disabledData: undefined,
  });
}

export function useProjectWorkspaces(
  projectId: string | null,
): StoreQueryResult<WorkspaceRow[] | undefined> {
  const query = useWorkspacesByProject();

  return useMemo(
    () => ({
      ...query,
      data: projectId && query.data ? (query.data[projectId] ?? []) : undefined,
    }),
    [projectId, query],
  );
}

export function useWorkspace(workspaceId: string | null): StoreQueryResult<WorkspaceRow | null> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceQuery(workspaceId) : null),
    [workspaceId],
  );

  return useStoreQuery(descriptor, {
    disabledData: null,
  });
}

export function useWorkspaceServices(
  workspaceId: string | null,
): StoreQueryResult<ServiceRow[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceServicesQuery(workspaceId) : null),
    [workspaceId],
  );

  return useStoreQuery(descriptor, {
    disabledData: undefined,
  });
}

export function useWorkspaceSetup(
  workspaceId: string | null,
): StoreQueryResult<SetupStepState[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceSetupQuery(workspaceId) : null),
    [workspaceId],
  );

  return useStoreQuery(descriptor, {
    disabledData: undefined,
  });
}
