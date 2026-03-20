import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type {
  ControlPlane,
  LocalWorkspaceCreateContext,
  WorkspaceCreateInput,
  WorkspaceCreateResult,
} from "./control-plane";

interface TauriInvoke {
  (cmd: string, args?: Record<string, unknown>): Promise<unknown>;
}

export class LocalControlPlane implements ControlPlane {
  private invoke: TauriInvoke;

  constructor(invoke: TauriInvoke) {
    this.invoke = invoke;
  }

  async getProjectWorkspace(projectId: string): Promise<WorkspaceRecord | null> {
    return this.invoke("get_workspace", { projectId }) as Promise<WorkspaceRecord | null>;
  }

  async listWorkspaces(): Promise<WorkspaceRecord[]> {
    return this.invoke("list_workspaces") as Promise<WorkspaceRecord[]>;
  }

  async listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>> {
    return this.invoke("list_workspaces_by_project") as Promise<
      Record<string, WorkspaceRecord[]>
    >;
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return this.invoke("list_projects") as Promise<ProjectRecord[]>;
  }

  async readManifestText(dirPath: string): Promise<string | null> {
    return this.invoke("read_manifest_text", { dirPath }) as Promise<string | null>;
  }

  async getCurrentBranch(projectPath: string): Promise<string> {
    return this.invoke("get_current_branch", { projectPath }) as Promise<string>;
  }

  async createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult> {
    const context = requireLocalContext(input.context);
    const workspaceId = (await this.invoke("create_workspace", {
      input: {
        kind: context.kind ?? "managed",
        projectId: context.projectId,
        projectPath: context.projectPath,
        workspaceName: context.workspaceName,
        baseRef: context.baseRef ?? input.sourceRef,
        worktreeRoot: context.worktreeRoot,
        manifestJson: input.manifestJson,
        manifestFingerprint: input.manifestFingerprint,
      },
    })) as string;

    return {
      workspace: {
        id: workspaceId,
        project_id: context.projectId,
        name: context.workspaceName ?? (context.kind === "root" ? "Root" : input.sourceRef),
        kind: context.kind ?? "managed",
        source_ref: input.sourceRef,
        git_sha: null,
        worktree_path: null,
        mode: "local",
        manifest_fingerprint: input.manifestFingerprint ?? null,
        created_by: null,
        source_workspace_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        expires_at: null,
      },
      worktreePath: "",
    };
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord> {
    return this.invoke("rename_workspace", {
      workspaceId,
      name,
    }) as Promise<WorkspaceRecord>;
  }

  async destroyWorkspace(workspaceId: string): Promise<void> {
    await this.invoke("destroy_workspace", { workspaceId });
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    return this.invoke("get_workspace_by_id", { workspaceId }) as Promise<WorkspaceRecord | null>;
  }
}

function requireLocalContext(context: WorkspaceCreateInput["context"]): LocalWorkspaceCreateContext {
  if (context.mode !== "local") {
    throw new Error("LocalControlPlane requires context.mode='local'");
  }
  return context;
}
