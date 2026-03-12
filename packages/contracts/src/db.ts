import type { TerminalFailureReason, TerminalStatus, TerminalType } from "./terminal";
import type {
  WorkspaceFailureReason,
  WorkspaceKind,
  WorkspaceMode,
  WorkspaceServiceExposure,
  WorkspaceServicePreviewFailureReason,
  WorkspaceServicePreviewStatus,
  WorkspaceServiceStatus,
  WorkspaceServiceStatusReason,
  WorkspaceStatus,
} from "./workspace";

export interface WorkspaceRecord {
  id: string;
  project_id: string;
  name: string;
  kind: WorkspaceKind;
  source_ref: string;
  git_sha: string | null;
  worktree_path: string | null;
  mode: WorkspaceMode;
  status: WorkspaceStatus;
  manifest_fingerprint?: string | null;
  failure_reason: WorkspaceFailureReason | null;
  failed_at: string | null;
  created_by: string | null;
  source_workspace_id: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  expires_at: string | null;
}

export interface ServiceRecord {
  id: string;
  workspace_id: string;
  service_name: string;
  exposure: WorkspaceServiceExposure;
  port_override: number | null;
  status: WorkspaceServiceStatus;
  status_reason: WorkspaceServiceStatusReason | null;
  default_port: number | null;
  effective_port: number | null;
  preview_status: WorkspaceServicePreviewStatus;
  preview_failure_reason: WorkspaceServicePreviewFailureReason | null;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TerminalRecord {
  id: string;
  workspace_id: string;
  launch_type: TerminalType;
  harness_provider: string | null;
  harness_session_id: string | null;
  created_by: string | null;
  label: string;
  status: TerminalStatus;
  failure_reason: TerminalFailureReason | null;
  exit_code: number | null;
  started_at: string;
  last_active_at: string;
  ended_at: string | null;
}
