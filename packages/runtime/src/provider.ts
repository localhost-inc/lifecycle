import type { WorkspaceRecord, WorkspaceServiceRecord } from "@lifecycle/contracts";

export interface LocalWorkspaceProviderCreateContext {
  mode: "local";
  projectId: string;
  projectPath: string;
  workspaceName?: string;
  baseRef?: string;
  worktreeRoot?: string;
}

export interface CloudWorkspaceProviderCreateContext {
  mode: "cloud";
  organizationId: string;
  repositoryId: string;
  projectId: string;
}

export type WorkspaceProviderCreateContext =
  | LocalWorkspaceProviderCreateContext
  | CloudWorkspaceProviderCreateContext;

export interface WorkspaceProviderCreateInput {
  workspaceId: string;
  sourceRef: string;
  manifestPath: string;
  resolvedSecrets: Record<string, string>;
  context: WorkspaceProviderCreateContext;
}

export interface WorkspaceProviderCreateResult {
  workspace: WorkspaceRecord;
  worktreePath: string;
}

export interface WorkspaceProviderStartInput {
  workspace: WorkspaceRecord;
  services: WorkspaceServiceRecord[];
  manifestJson: string;
}

export interface WorkspaceProviderHealthResult {
  healthy: boolean;
  services: WorkspaceServiceRecord[];
}

export interface WorkspaceProvider {
  createWorkspace(input: WorkspaceProviderCreateInput): Promise<WorkspaceProviderCreateResult>;
  startServices(input: WorkspaceProviderStartInput): Promise<WorkspaceServiceRecord[]>;
  healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult>;
  stopServices(workspaceId: string, serviceNames?: string[]): Promise<void>;
  runSetup(workspaceId: string): Promise<void>;
  sleep(workspaceId: string): Promise<void>;
  wake(workspaceId: string): Promise<void>;
  destroy(workspaceId: string): Promise<void>;
  openTerminal(workspaceId: string, cols: number, rows: number): Promise<{ terminalId: string }>;
  exposePort(workspaceId: string, serviceName: string, port: number): Promise<string | null>;
}
