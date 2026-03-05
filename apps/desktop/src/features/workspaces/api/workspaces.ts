import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  WorkspaceStatus,
  WorkspaceFailureReason,
  WorkspaceServiceStatus,
} from "@lifecycle/contracts";

export interface WorkspaceRow {
  id: string;
  project_id: string;
  source_ref: string;
  git_sha: string | null;
  worktree_path: string | null;
  mode: string;
  mode_state: string | null;
  status: string;
  failure_reason: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  expires_at: string | null;
}

export interface ServiceRow {
  id: string;
  workspace_id: string;
  service_name: string;
  exposure: string;
  port_override: number | null;
  status: string;
  status_reason: string | null;
  default_port: number | null;
  effective_port: number | null;
  preview_state: string;
  preview_failure_reason: string | null;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceStatusEvent {
  workspace_id: string;
  status: WorkspaceStatus;
  failure_reason: WorkspaceFailureReason | null;
}

export interface ServiceStatusEvent {
  workspace_id: string;
  service_name: string;
  status: WorkspaceServiceStatus;
  status_reason: string | null;
}

export interface SetupStepEvent {
  workspace_id: string;
  step_name: string;
  event_type: "started" | "stdout" | "stderr" | "completed" | "failed" | "timeout";
  data: string | null;
}

export async function createWorkspace(
  projectId: string,
  sourceRef: string,
  projectPath: string,
): Promise<string> {
  return invoke<string>("create_workspace", {
    projectId,
    sourceRef,
    projectPath,
  });
}

export async function startServices(workspaceId: string, manifestJson: string): Promise<void> {
  return invoke<void>("start_services", { workspaceId, manifestJson });
}

export async function stopWorkspace(workspaceId: string): Promise<void> {
  return invoke<void>("stop_workspace", { workspaceId });
}

export async function getWorkspace(projectId: string): Promise<WorkspaceRow | null> {
  return invoke<WorkspaceRow | null>("get_workspace", { projectId });
}

export async function getWorkspaceById(workspaceId: string): Promise<WorkspaceRow | null> {
  return invoke<WorkspaceRow | null>("get_workspace_by_id", { workspaceId });
}

export async function listWorkspaces(): Promise<WorkspaceRow[]> {
  return invoke<WorkspaceRow[]>("list_workspaces");
}

export async function listWorkspacesByProject(): Promise<Record<string, WorkspaceRow[]>> {
  return invoke<Record<string, WorkspaceRow[]>>("list_workspaces_by_project");
}

export async function getWorkspaceServices(workspaceId: string): Promise<ServiceRow[]> {
  return invoke<ServiceRow[]>("get_workspace_services", { workspaceId });
}

export async function getCurrentBranch(projectPath: string): Promise<string> {
  return invoke<string>("get_current_branch", { projectPath });
}

export interface WorkspaceEventCallbacks {
  onWorkspaceStatus?: (event: WorkspaceStatusEvent) => void;
  onServiceStatus?: (event: ServiceStatusEvent) => void;
  onSetupProgress?: (event: SetupStepEvent) => void;
}

export async function subscribeToWorkspaceEvents(
  workspaceId: string,
  callbacks: WorkspaceEventCallbacks,
): Promise<UnlistenFn> {
  const unlisteners: UnlistenFn[] = [];

  if (callbacks.onWorkspaceStatus) {
    const cb = callbacks.onWorkspaceStatus;
    unlisteners.push(
      await listen<WorkspaceStatusEvent>("workspace:status-changed", (e) => {
        if (e.payload.workspace_id === workspaceId) {
          cb(e.payload);
        }
      }),
    );
  }

  if (callbacks.onServiceStatus) {
    const cb = callbacks.onServiceStatus;
    unlisteners.push(
      await listen<ServiceStatusEvent>("service:status-changed", (e) => {
        if (e.payload.workspace_id === workspaceId) {
          cb(e.payload);
        }
      }),
    );
  }

  if (callbacks.onSetupProgress) {
    const cb = callbacks.onSetupProgress;
    unlisteners.push(
      await listen<SetupStepEvent>("setup:step-progress", (e) => {
        if (e.payload.workspace_id === workspaceId) {
          cb(e.payload);
        }
      }),
    );
  }

  return () => {
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}
