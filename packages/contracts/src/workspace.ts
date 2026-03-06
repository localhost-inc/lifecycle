export type WorkspaceMode = "local" | "cloud";

export type WorkspaceStatus =
  | "creating"
  | "starting"
  | "ready"
  | "resetting"
  | "sleeping"
  | "destroying"
  | "failed";

export type WorkspaceFailureReason =
  | "capacity_unavailable"
  | "manifest_invalid"
  | "manifest_secret_unresolved"
  | "repo_clone_failed"
  | "repository_disconnected"
  | "setup_step_failed"
  | "service_start_failed"
  | "service_healthcheck_failed"
  | "sandbox_unreachable"
  | "local_docker_unavailable"
  | "local_port_conflict"
  | "local_app_not_running"
  | "operation_timeout"
  | "unknown";

export interface WorkspaceRecord {
  id: string;
  projectId: string;
  mode: WorkspaceMode;
  sourceRef: string;
  gitSha?: string;
  worktreePath?: string;
  status: WorkspaceStatus;
  failureReason?: WorkspaceFailureReason;
  failedAt?: string;
  createdBy?: string;
  sourceWorkspaceId?: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  expiresAt?: string;
}

export type WorkspaceServiceStatus = "starting" | "ready" | "failed" | "stopped";

export type WorkspaceServiceStatusReason =
  | "service_process_exited"
  | "service_dependency_failed"
  | "service_port_unreachable"
  | "unknown";

export type WorkspaceServicePreviewState =
  | "disabled"
  | "provisioning"
  | "ready"
  | "sleeping"
  | "failed"
  | "expired";

export type WorkspaceServicePreviewFailureReason =
  | "route_bind_failed"
  | "route_reconcile_failed"
  | "service_unreachable"
  | "policy_denied"
  | "unknown";

export type WorkspaceServiceExposure = "internal" | "organization" | "local";

export interface WorkspaceServiceRecord {
  id: string;
  workspaceId: string;
  serviceName: string;
  exposure: WorkspaceServiceExposure;
  portOverride?: number;
  status: WorkspaceServiceStatus;
  statusReason?: WorkspaceServiceStatusReason;
  defaultPort?: number;
  effectivePort?: number;
  previewState: WorkspaceServicePreviewState;
  previewFailureReason?: WorkspaceServicePreviewFailureReason;
  previewUrl?: string;
  createdAt: string;
  updatedAt: string;
}
