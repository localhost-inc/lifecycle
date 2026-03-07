import type { GitLogEntry, GitStatusResult, ProjectRecord } from "@lifecycle/contracts";
import { getGitLog, getGitStatus } from "../features/git/api";
import type { ManifestStatus } from "../features/projects/api/projects";
import type { TerminalRow } from "../features/terminals/api";
import {
  getTerminal,
  listWorkspaceTerminals,
  subscribeToTerminalCreatedEvents,
  subscribeToTerminalRemovedEvents,
  subscribeToTerminalStatusEvents,
} from "../features/terminals/api";
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
  getWorkspaceGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]>;
  getWorkspaceGitStatus(workspaceId: string): Promise<GitStatusResult>;
  listWorkspaceTerminals(workspaceId: string): Promise<TerminalRow[]>;
  getTerminal(terminalId: string): Promise<TerminalRow | null>;
  subscribe(listener: (event: StoreEvent) => void): Promise<() => void>;
}

export function createSource(): StoreSource {
  return {
    listProjects,
    readManifest,
    listWorkspacesByProject,
    getWorkspace: getWorkspaceById,
    getWorkspaceGitLog: getGitLog,
    getWorkspaceGitStatus: getGitStatus,
    getWorkspaceServices,
    getTerminal,
    listWorkspaceTerminals,
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
        subscribeToTerminalCreatedEvents((event) => {
          listener({
            kind: "terminal-created",
            terminal: event.terminal,
            workspaceId: event.workspace_id,
          });
        }),
        subscribeToTerminalStatusEvents((event) => {
          listener({
            endedAt: event.ended_at,
            exitCode: event.exit_code,
            failureReason: event.failure_reason,
            kind: "terminal-status-changed",
            status: event.status,
            terminalId: event.terminal_id,
            workspaceId: event.workspace_id,
          });
        }),
        subscribeToTerminalRemovedEvents((event) => {
          listener({
            kind: "terminal-removed",
            terminalId: event.terminal_id,
            workspaceId: event.workspace_id,
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
