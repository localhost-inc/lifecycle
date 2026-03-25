import type { AgentSessionRecord } from "./agent";
import type { PlanStatus, TaskPriority, TaskStatus } from "./planning";
import type {
  ServiceStatus,
  ServiceStatusReason,
  WorkspaceCheckoutType,
  WorkspaceFailureReason,
  WorkspaceStatus,
  WorkspaceTarget,
} from "./workspace";

export interface WorkspaceRecord {
  id: string;
  project_id: string;
  name: string;
  checkout_type: WorkspaceCheckoutType;
  source_ref: string;
  git_sha: string | null;
  worktree_path: string | null;
  target: WorkspaceTarget;
  manifest_fingerprint?: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  prepared_at?: string | null;
  status: WorkspaceStatus;
  failure_reason: WorkspaceFailureReason | null;
  failed_at: string | null;
}

export interface ServiceRecord {
  id: string;
  workspace_id: string;
  name: string;
  status: ServiceStatus;
  status_reason: ServiceStatusReason | null;
  assigned_port: number | null;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export type { AgentSessionRecord };

export interface PlanRecord {
  id: string;
  project_id: string;
  workspace_id: string | null;
  name: string;
  description: string;
  body: string;
  status: PlanStatus;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskRecord {
  id: string;
  plan_id: string;
  project_id: string;
  workspace_id: string | null;
  agent_session_id: string | null;
  name: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDependencyRecord {
  task_id: string;
  depends_on_task_id: string;
}
