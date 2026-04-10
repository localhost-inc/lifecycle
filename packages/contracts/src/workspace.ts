import { z } from "zod";

/** Maximum file size (in bytes) the editor will load into memory. */
export const WORKSPACE_MAX_TEXT_FILE_BYTES = 1024 * 1024;

export const WorkspaceHostSchema = z
  .enum(["local", "docker", "remote", "cloud"])
  .meta({ id: "WorkspaceHost" });
export type WorkspaceHost = z.infer<typeof WorkspaceHostSchema>;

export const WorkspaceCheckoutTypeSchema = z
  .enum(["root", "worktree"])
  .meta({ id: "WorkspaceCheckoutType" });
export type WorkspaceCheckoutType = z.infer<typeof WorkspaceCheckoutTypeSchema>;

export const WorkspaceStatusSchema = z
  .enum(["provisioning", "active", "archiving", "archived", "failed"])
  .meta({ id: "WorkspaceStatus" });
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const WorkspaceFailureReasonSchema = z
  .enum([
    "capacity_unavailable",
    "environment_task_failed",
    "manifest_invalid",
    "repo_clone_failed",
    "repository_disconnected",
    "prepare_step_failed",
    "service_start_failed",
    "service_healthcheck_failed",
    "sandbox_unreachable",
    "local_docker_unavailable",
    "local_port_conflict",
    "local_app_not_running",
    "operation_timeout",
    "unknown",
  ])
  .meta({ id: "WorkspaceFailureReason" });
export type WorkspaceFailureReason = z.infer<typeof WorkspaceFailureReasonSchema>;

export const ServiceStatusSchema = z
  .enum(["starting", "ready", "failed", "stopped"])
  .meta({ id: "ServiceStatus" });
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const ServiceStatusReasonSchema = z
  .enum([
    "service_start_failed",
    "service_process_exited",
    "service_dependency_failed",
    "service_port_unreachable",
    "unknown",
  ])
  .meta({ id: "ServiceStatusReason" });
export type ServiceStatusReason = z.infer<typeof ServiceStatusReasonSchema>;
