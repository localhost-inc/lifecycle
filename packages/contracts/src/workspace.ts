export type WorkspaceMode = "local" | "cloud";

export type WorkspaceStatus = "idle" | "starting" | "active" | "stopping";

export type WorkspaceFailureReason =
  | "capacity_unavailable"
  | "manifest_invalid"
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

export type WorkspaceServiceStatus = "starting" | "ready" | "failed" | "stopped";

export type WorkspaceServiceStatusReason =
  | "service_process_exited"
  | "service_dependency_failed"
  | "service_port_unreachable"
  | "unknown";

export type WorkspaceServicePreviewStatus =
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
