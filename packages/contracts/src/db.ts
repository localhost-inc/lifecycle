import type { TerminalFailureReason, TerminalStatus, TerminalType } from "./terminal";
import type {
  EnvironmentFailureReason,
  EnvironmentStatus,
  ServiceStatus,
  ServiceStatusReason,
  WorkspaceKind,
  WorkspaceMode,
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
  manifest_fingerprint?: string | null;
  created_by: string | null;
  source_workspace_id: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  expires_at: string | null;
  prepared_at?: string | null;
}

export interface EnvironmentRecord {
  workspace_id: string;
  status: EnvironmentStatus;
  failure_reason: EnvironmentFailureReason | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRecord {
  id: string;
  environment_id: string;
  name: string;
  status: ServiceStatus;
  status_reason: ServiceStatusReason | null;
  assigned_port: number | null;
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
