import type { ProjectRecord } from "@lifecycle/contracts";
import type { ManifestStatus } from "../features/projects/api/projects";
import { listProjects, readManifest } from "../features/projects/api/projects";
import type { ServiceRow, WorkspaceRow } from "../features/workspaces/api";
import {
  getWorkspaceById,
  getWorkspaceServices,
  listWorkspacesByProject,
  subscribeToServiceStatusEvents,
  subscribeToSetupProgressEvents,
  subscribeToWorkspaceStatusEvents,
} from "../features/workspaces/api";
import type { StoreEvent } from "./events";

export interface StoreSource {
  listProjects(): Promise<ProjectRecord[]>;
  readManifest(projectPath: string): Promise<ManifestStatus>;
  listWorkspacesByProject(): Promise<Record<string, WorkspaceRow[]>>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRow | null>;
  getWorkspaceServices(workspaceId: string): Promise<ServiceRow[]>;
  subscribe(listener: (event: StoreEvent) => void): Promise<() => void>;
}

export function createSource(): StoreSource {
  return {
    listProjects,
    readManifest,
    listWorkspacesByProject,
    getWorkspace: getWorkspaceById,
    getWorkspaceServices,
    async subscribe(listener) {
      const unlisten = await Promise.all([
        subscribeToWorkspaceStatusEvents((event) => {
          listener({
            kind: "workspace-status-changed",
            workspaceId: event.workspace_id,
            status: event.status,
            failureReason: event.failure_reason,
          });
        }),
        subscribeToServiceStatusEvents((event) => {
          listener({
            kind: "workspace-service-status-changed",
            workspaceId: event.workspace_id,
            serviceName: event.service_name,
            status: event.status,
            statusReason: event.status_reason,
          });
        }),
        subscribeToSetupProgressEvents((event) => {
          listener({
            kind: "workspace-setup-progress",
            workspaceId: event.workspace_id,
            stepName: event.step_name,
            eventType: event.event_type,
            data: event.data,
          });
        }),
      ]);

      return () => {
        for (const stop of unlisten) {
          stop();
        }
      };
    },
  };
}
