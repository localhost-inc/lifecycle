import type { WorkspaceRecord } from "@lifecycle/contracts";
import type {
  ControlPlane,
  WorkspaceCreateInput,
  WorkspaceCreateResult,
} from "./control-plane";

export interface CloudControlPlaneClient {
  getProjectWorkspace(projectId: string): Promise<WorkspaceRecord | null>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>>;
  listProjects(): Promise<Awaited<ReturnType<ControlPlane["listProjects"]>>>;
  readManifestText(dirPath: string): Promise<string | null>;
  getCurrentBranch(projectPath: string): Promise<string>;
  createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult>;
  renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord>;
  destroyWorkspace(workspaceId: string): Promise<void>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
}

export class CloudControlPlane implements ControlPlane {
  private client: CloudControlPlaneClient;

  constructor(client: CloudControlPlaneClient) {
    this.client = client;
  }

  getProjectWorkspace(projectId: string): Promise<WorkspaceRecord | null> {
    return this.client.getProjectWorkspace(projectId);
  }

  listWorkspaces(): Promise<WorkspaceRecord[]> {
    return this.client.listWorkspaces();
  }

  listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>> {
    return this.client.listWorkspacesByProject();
  }

  listProjects(): Promise<Awaited<ReturnType<ControlPlane["listProjects"]>>> {
    return this.client.listProjects();
  }

  readManifestText(dirPath: string): Promise<string | null> {
    return this.client.readManifestText(dirPath);
  }

  getCurrentBranch(projectPath: string): Promise<string> {
    return this.client.getCurrentBranch(projectPath);
  }

  createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult> {
    return this.client.createWorkspace(input);
  }

  renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord> {
    return this.client.renameWorkspace(workspaceId, name);
  }

  destroyWorkspace(workspaceId: string): Promise<void> {
    return this.client.destroyWorkspace(workspaceId);
  }

  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    return this.client.getWorkspace(workspaceId);
  }
}
