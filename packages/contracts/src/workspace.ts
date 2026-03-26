/** Maximum file size (in bytes) the editor will load into memory. */
export const WORKSPACE_MAX_TEXT_FILE_BYTES = 1024 * 1024;

export type WorkspaceHost = "local" | "docker" | "remote" | "cloud";

export type WorkspaceCheckoutType = "root" | "worktree";

export type WorkspaceStatus = "provisioning" | "active" | "archiving" | "archived" | "failed";

export type WorkspaceFailureReason =
  | "capacity_unavailable"
  | "environment_task_failed"
  | "manifest_invalid"
  | "repo_clone_failed"
  | "repository_disconnected"
  | "prepare_step_failed"
  | "service_start_failed"
  | "service_healthcheck_failed"
  | "sandbox_unreachable"
  | "local_docker_unavailable"
  | "local_port_conflict"
  | "local_app_not_running"
  | "operation_timeout"
  | "unknown";

export type ServiceStatus = "starting" | "ready" | "failed" | "stopped";

export type ServiceStatusReason =
  | "service_start_failed"
  | "service_process_exited"
  | "service_dependency_failed"
  | "service_port_unreachable"
  | "unknown";
