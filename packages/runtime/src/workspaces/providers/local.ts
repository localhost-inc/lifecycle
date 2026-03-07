import type {
  GitCommitResult,
  GitDiffResult,
  GitLogEntry,
  GitPushResult,
  GitStatusResult,
  WorkspaceServiceRecord,
} from "@lifecycle/contracts";
import type {
  LocalWorkspaceProviderCreateContext,
  WorkspaceProviderAttachTerminalInput,
  WorkspaceProviderAttachTerminalResult,
  WorkspaceProvider,
  WorkspaceProviderCreateTerminalInput,
  WorkspaceProviderCreateInput,
  WorkspaceProviderCreateResult,
  WorkspaceProviderGitDiffInput,
  WorkspaceProviderHealthResult,
  WorkspaceProviderStartInput,
} from "../../provider";

interface TauriInvoke {
  (cmd: string, args?: Record<string, unknown>): Promise<unknown>;
}

export class LocalWorkspaceProvider implements WorkspaceProvider {
  private invoke: TauriInvoke;

  constructor(invoke: TauriInvoke) {
    this.invoke = invoke;
  }

  async createWorkspace(
    input: WorkspaceProviderCreateInput,
  ): Promise<WorkspaceProviderCreateResult> {
    const context = requireLocalContext(input.context);
    const workspaceId = (await this.invoke("create_workspace", {
      projectId: context.projectId,
      projectPath: context.projectPath,
      workspaceName: context.workspaceName,
      baseRef: context.baseRef ?? input.sourceRef,
      worktreeRoot: context.worktreeRoot,
    })) as string;

    return {
      workspace: {
        id: workspaceId,
        projectId: context.projectId,
        mode: "local",
        sourceRef: input.sourceRef,
        status: "creating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      worktreePath: "",
    };
  }

  async startServices(input: WorkspaceProviderStartInput): Promise<WorkspaceServiceRecord[]> {
    await this.invoke("start_services", {
      workspaceId: input.workspace.id,
      manifestJson: input.manifestJson,
    });
    return input.services;
  }

  async healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult> {
    const services = (await this.invoke("get_workspace_services", {
      workspaceId,
    })) as WorkspaceServiceRecord[];
    const healthy = services.every((s) => s.status === "ready");
    return { healthy, services };
  }

  async stopServices(workspaceId: string): Promise<void> {
    await this.invoke("stop_workspace", { workspaceId });
  }

  async runSetup(_workspaceId: string): Promise<void> {
    // Setup runs as part of start_services.
  }

  async sleep(workspaceId: string): Promise<void> {
    await this.invoke("stop_workspace", { workspaceId });
  }

  async wake(_workspaceId: string): Promise<void> {
    // TODO: M5 — restart services from sleeping state.
  }

  async destroy(_workspaceId: string): Promise<void> {
    // TODO: M5 — stop + remove worktree + delete records.
  }

  async createTerminal(
    input: WorkspaceProviderCreateTerminalInput,
  ): Promise<WorkspaceProviderAttachTerminalResult> {
    return this.invoke("create_terminal", {
      workspaceId: input.workspaceId,
      launchType: input.launchType,
      harnessProvider: input.harnessProvider,
      harnessSessionId: input.harnessSessionId,
      cols: input.cols,
      rows: input.rows,
    }) as Promise<WorkspaceProviderAttachTerminalResult>;
  }

  async attachTerminal(
    input: WorkspaceProviderAttachTerminalInput,
  ): Promise<WorkspaceProviderAttachTerminalResult> {
    return this.invoke("attach_terminal", {
      terminalId: input.terminalId,
      cols: input.cols,
      rows: input.rows,
    }) as Promise<WorkspaceProviderAttachTerminalResult>;
  }

  async writeTerminal(terminalId: string, data: string): Promise<void> {
    await this.invoke("write_terminal", { terminalId, data });
  }

  async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
    await this.invoke("resize_terminal", { terminalId, cols, rows });
  }

  async detachTerminal(terminalId: string): Promise<void> {
    await this.invoke("detach_terminal", { terminalId });
  }

  async killTerminal(terminalId: string): Promise<void> {
    await this.invoke("kill_terminal", { terminalId });
  }

  async exposePort(
    _workspaceId: string,
    _serviceName: string,
    _port: number,
  ): Promise<string | null> {
    // TODO: M6.
    return null;
  }

  async getGitStatus(workspaceId: string): Promise<GitStatusResult> {
    return this.invoke("get_workspace_git_status", { workspaceId }) as Promise<GitStatusResult>;
  }

  async getGitDiff(input: WorkspaceProviderGitDiffInput): Promise<GitDiffResult> {
    return this.invoke("get_workspace_git_diff", {
      workspaceId: input.workspaceId,
      filePath: input.filePath,
      scope: input.scope,
    }) as Promise<GitDiffResult>;
  }

  async listGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]> {
    return this.invoke("list_workspace_git_log", {
      workspaceId,
      limit,
    }) as Promise<GitLogEntry[]>;
  }

  async stageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
    await this.invoke("stage_workspace_git_files", { workspaceId, filePaths });
  }

  async unstageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
    await this.invoke("unstage_workspace_git_files", { workspaceId, filePaths });
  }

  async commitGit(workspaceId: string, message: string): Promise<GitCommitResult> {
    return this.invoke("commit_workspace_git", {
      workspaceId,
      message,
    }) as Promise<GitCommitResult>;
  }

  async pushGit(workspaceId: string): Promise<GitPushResult> {
    return this.invoke("push_workspace_git", { workspaceId }) as Promise<GitPushResult>;
  }
}

function requireLocalContext(
  context: WorkspaceProviderCreateInput["context"],
): LocalWorkspaceProviderCreateContext {
  if (context.mode !== "local") {
    throw new Error("LocalWorkspaceProvider requires context.mode='local'");
  }
  return context;
}
