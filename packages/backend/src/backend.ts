import type { ProjectRecord, WorkspaceKind, WorkspaceRecord } from "@lifecycle/contracts";

export interface LocalWorkspaceCreateContext {
  mode: "local";
  kind?: WorkspaceKind;
  projectId: string;
  projectPath: string;
  workspaceName?: string;
  baseRef?: string;
  worktreeRoot?: string;
}

export interface CloudWorkspaceCreateContext {
  mode: "cloud";
  organizationId: string;
  repositoryId: string;
  projectId: string;
}

export type WorkspaceCreateContext = LocalWorkspaceCreateContext | CloudWorkspaceCreateContext;

export interface WorkspaceCreateInput {
  manifestJson?: string | null;
  manifestFingerprint?: string | null;
  context: WorkspaceCreateContext;
}

export interface WorkspaceCreateResult {
  workspace: WorkspaceRecord;
  worktreePath: string;
}

export interface Backend {
  getProjectWorkspace(projectId: string): Promise<WorkspaceRecord | null>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>>;
  listProjects(): Promise<ProjectRecord[]>;
  readManifestText(dirPath: string): Promise<string | null>;
  getCurrentBranch(projectPath: string): Promise<string>;
  createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult>;
  renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord>;
  destroyWorkspace(workspaceId: string): Promise<void>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
}
