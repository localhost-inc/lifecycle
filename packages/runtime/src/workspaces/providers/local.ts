import type {
  GitBranchPullRequestResult,
  GitCommitResult,
  GitDiffResult,
  GitLogEntry,
  GitPullRequestListResult,
  GitPullRequestSummary,
  GitPushResult,
  GitStatusResult,
  ServiceRecord,
  TerminalRecord,
} from "@lifecycle/contracts";
import type {
  LocalWorkspaceProviderCreateContext,
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
      kind: context.kind ?? "managed",
      projectId: context.projectId,
      projectPath: context.projectPath,
      workspaceName: context.workspaceName,
      baseRef: context.baseRef ?? input.sourceRef,
      worktreeRoot: context.worktreeRoot,
    })) as string;

    return {
      workspace: {
        id: workspaceId,
        project_id: context.projectId,
        name:
          context.workspaceName ??
          (context.kind === "root" ? "Root" : input.sourceRef),
        kind: context.kind ?? "managed",
        source_ref: input.sourceRef,
        git_sha: null,
        worktree_path: null,
        mode: "local",
        status: "idle",
        failure_reason: null,
        failed_at: null,
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

  async startServices(input: WorkspaceProviderStartInput): Promise<ServiceRecord[]> {
    await this.invoke("start_services", {
      workspaceId: input.workspace.id,
      manifestJson: input.manifestJson,
    });
    return input.services;
  }

  async healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult> {
    const services = (await this.invoke("get_workspace_services", {
      workspaceId,
    })) as ServiceRecord[];
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
    // TODO: M4 — restart services from idle state.
  }

  async destroy(_workspaceId: string): Promise<void> {
    // TODO: M4 — stop + remove worktree + delete records.
  }

  async createTerminal(
    input: WorkspaceProviderCreateTerminalInput,
  ): Promise<TerminalRecord> {
    return this.invoke("create_terminal", {
      workspaceId: input.workspaceId,
      launchType: input.launchType,
      harnessProvider: input.harnessProvider,
      harnessSessionId: input.harnessSessionId,
    }) as Promise<TerminalRecord>;
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
    // TODO: M5.
    return null;
  }

  async getGitStatus(workspaceId: string): Promise<GitStatusResult> {
    return this.invoke("get_workspace_git_status", { workspaceId }) as Promise<GitStatusResult>;
  }

  async getGitChangesPatch(workspaceId: string): Promise<string> {
    return this.invoke("get_workspace_git_changes_patch", { workspaceId }) as Promise<string>;
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

  async listGitPullRequests(workspaceId: string): Promise<GitPullRequestListResult> {
    return this.invoke("list_workspace_git_pull_requests", {
      workspaceId,
    }) as Promise<GitPullRequestListResult>;
  }

  async getCurrentGitPullRequest(workspaceId: string): Promise<GitBranchPullRequestResult> {
    return this.invoke("get_workspace_current_git_pull_request", {
      workspaceId,
    }) as Promise<GitBranchPullRequestResult>;
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

  async createGitPullRequest(workspaceId: string): Promise<GitPullRequestSummary> {
    return this.invoke("create_workspace_git_pull_request", {
      workspaceId,
    }) as Promise<GitPullRequestSummary>;
  }

  async mergeGitPullRequest(
    workspaceId: string,
    pullRequestNumber: number,
  ): Promise<GitPullRequestSummary> {
    return this.invoke("merge_workspace_git_pull_request", {
      workspaceId,
      pullRequestNumber,
    }) as Promise<GitPullRequestSummary>;
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
