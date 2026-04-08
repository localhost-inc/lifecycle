import type { AgentRecord } from "./agent";
import type { PlanStatus, TaskPriority, TaskStatus } from "./planning";
import type {
  WorkspaceCheckoutType,
  WorkspaceFailureReason,
  WorkspaceStatus,
  WorkspaceHost,
} from "./workspace";

export interface WorkspaceRecord {
  id: string;
  repository_id: string;
  name: string;
  slug: string;
  checkout_type: WorkspaceCheckoutType;
  source_ref: string;
  git_sha: string | null;
  workspace_root: string | null;
  host: WorkspaceHost;
  manifest_fingerprint?: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  prepared_at?: string | null;
  status: WorkspaceStatus;
  failure_reason: WorkspaceFailureReason | null;
  failed_at: string | null;
}

export type { AgentRecord };

export interface PlanRecord {
  id: string;
  repository_id: string;
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
  repository_id: string;
  workspace_id: string | null;
  agent_id: string | null;
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
