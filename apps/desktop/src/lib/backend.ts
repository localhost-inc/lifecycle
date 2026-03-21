import type {
  Backend,
  WorkspaceCreateInput,
  WorkspaceCreateResult,
} from "@lifecycle/backend";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { invokeTauri } from "@/lib/tauri-error";

let backend: Backend | null = null;

export function getBackend(): Backend {
  backend ??= createTauriBackend((command, args) => invokeTauri(command, args));
  return backend;
}

export function resetBackendForTests(): void {
  backend = null;
}

interface TauriInvoke {
  (cmd: string, args?: Record<string, unknown>): Promise<unknown>;
}

export function createTauriBackend(invoke: TauriInvoke): Backend {
  return new TauriBackend(invoke);
}

class TauriBackend implements Backend {
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
    const context = requireDesktopCreateContext(input.context);
    return this.invoke("create_workspace", {
      input: {
        target: context.target,
        checkoutType: context.checkoutType ?? "worktree",
        projectId: context.projectId,
        projectPath: context.projectPath,
        workspaceName: context.workspaceName,
        baseRef: context.baseRef,
        worktreeRoot: context.worktreeRoot,
        manifestJson: input.manifestJson,
        manifestFingerprint: input.manifestFingerprint,
      },
    }) as Promise<WorkspaceCreateResult>;
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

function requireDesktopCreateContext(
  context: WorkspaceCreateInput["context"],
): WorkspaceCreateInput["context"] & { target: "local" | "docker"; projectPath: string } {
  if (context.target !== "local" && context.target !== "docker") {
    throw new Error(`This backend does not support workspace target '${context.target}' yet.`);
  }

  if (!context.projectPath) {
    throw new Error(`${context.target} workspace creation requires a project path.`);
  }

  return {
    ...context,
    target: context.target,
    projectPath: context.projectPath,
  };
}
