import type {
  Backend,
  LocalWorkspaceCreateContext,
  WorkspaceCreateInput,
  WorkspaceCreateResult,
} from "@lifecycle/backend";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { invokeTauri } from "@/lib/tauri-error";

let backend: Backend | null = null;

export function getBackend(): Backend {
  backend ??= new TauriBackend((command, args) => invokeTauri(command, args));
  return backend;
}

export function resetBackendForTests(): void {
  backend = null;
}

interface TauriInvoke {
  (cmd: string, args?: Record<string, unknown>): Promise<unknown>;
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
    const context = requireLocalCreateContext(input.context);
    return this.invoke("create_workspace", {
      input: {
        kind: context.kind ?? "managed",
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

function requireLocalCreateContext(
  context: WorkspaceCreateInput["context"],
): LocalWorkspaceCreateContext {
  if (context.mode !== "local") {
    throw new Error("Desktop backend createWorkspace does not support cloud mode yet");
  }
  return context;
}
