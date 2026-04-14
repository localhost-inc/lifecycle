import type { ServiceStatus, ServiceStatusReason } from "./workspace";

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

export type StackSummaryState = "ready" | "missing" | "invalid" | "unconfigured";

interface StackNodeRecordBase {
  workspace_id: string;
  name: string;
  depends_on: string[];
}

interface StackManagedRecordBase extends StackNodeRecordBase {
  status: ServiceStatus;
  status_reason: ServiceStatusReason | null;
  assigned_port: number | null;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface StackProcessRecord extends StackManagedRecordBase {
  kind: "process";
}

export interface StackImageRecord extends StackManagedRecordBase {
  kind: "image";
}

export interface StackTaskRecord extends StackNodeRecordBase {
  kind: "task";
  run_on: "create" | "start" | null;
  command: string | null;
  write_files_count: number;
}

export type StackManagedRecord = StackProcessRecord | StackImageRecord;
export type StackNodeRecord = StackManagedRecord | StackTaskRecord;

export interface StackSummaryRecord {
  workspace_id: string;
  state: StackSummaryState;
  errors: string[];
  nodes: StackNodeRecord[];
}
