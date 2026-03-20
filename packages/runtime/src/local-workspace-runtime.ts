import type {
  EnvironmentRecord,
  GitBranchPullRequestResult,
  GitCommitDiffResult,
  GitCommitResult,
  GitDiffResult,
  GitDiffScope,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitPullRequestSummary,
  GitPushResult,
  GitStatusResult,
  LifecycleEvent,
  ServiceRecord,
  TerminalRecord,
} from "@lifecycle/contracts";
import type {
  CreateTerminalInput,
  GitDiffInput,
  SavedTerminalAttachment,
  ServiceLogSnapshot,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceHealthResult,
  WorkspaceRuntime,
  WorkspaceStartInput,
  WorkspaceWakeInput,
  SaveTerminalAttachmentInput,
} from "./workspace-runtime";

interface TauriInvoke {
  (cmd: string, args?: Record<string, unknown>): Promise<unknown>;
}

export class LocalWorkspaceRuntime implements WorkspaceRuntime {
  private invoke: TauriInvoke;

  constructor(invoke: TauriInvoke) {
    this.invoke = invoke;
  }

  async startServices(input: WorkspaceStartInput): Promise<ServiceRecord[]> {
    await this.invokeStartServices(input);
    return input.services;
  }

  async healthCheck(workspaceId: string): Promise<WorkspaceHealthResult> {
    const services = (await this.invoke("get_workspace_services", {
      workspaceId,
    })) as ServiceRecord[];
    const healthy = services.every((s) => s.status === "ready");
    return { healthy, services };
  }

  async stopServices(workspaceId: string): Promise<void> {
    await this.invoke("stop_workspace", { workspaceId });
  }

  async sleep(workspaceId: string): Promise<void> {
    await this.invoke("stop_workspace", { workspaceId });
  }

  async wake(input: WorkspaceWakeInput): Promise<void> {
    await this.invokeStartServices(input);
  }

  async getEnvironment(workspaceId: string): Promise<EnvironmentRecord> {
    return this.invoke("get_workspace_environment", {
      workspaceId,
    }) as Promise<EnvironmentRecord>;
  }

  async getActivity(workspaceId: string): Promise<LifecycleEvent[]> {
    return this.invoke("get_workspace_activity", { workspaceId }) as Promise<LifecycleEvent[]>;
  }

  async getServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]> {
    return this.invoke("get_workspace_service_logs", {
      workspaceId,
    }) as Promise<ServiceLogSnapshot[]>;
  }

  async getServices(workspaceId: string): Promise<ServiceRecord[]> {
    return this.invoke("get_workspace_services", { workspaceId }) as Promise<ServiceRecord[]>;
  }

  async createTerminal(input: CreateTerminalInput): Promise<TerminalRecord> {
    return this.invoke("create_terminal", {
      harnessLaunchConfig: input.harnessLaunchConfig ?? null,
      workspaceId: input.workspaceId,
      launchType: input.launchType,
      harnessProvider: input.harnessProvider,
      harnessSessionId: input.harnessSessionId,
    }) as Promise<TerminalRecord>;
  }

  async listTerminals(workspaceId: string): Promise<TerminalRecord[]> {
    return this.invoke("list_workspace_terminals", { workspaceId }) as Promise<TerminalRecord[]>;
  }

  async getTerminal(terminalId: string): Promise<TerminalRecord | null> {
    return this.invoke("get_terminal", { terminalId }) as Promise<TerminalRecord | null>;
  }

  async renameTerminal(terminalId: string, label: string): Promise<TerminalRecord> {
    return this.invoke("rename_terminal", {
      terminalId,
      label,
    }) as Promise<TerminalRecord>;
  }

  async saveTerminalAttachment(
    input: SaveTerminalAttachmentInput,
  ): Promise<SavedTerminalAttachment> {
    return this.invoke("save_terminal_attachment", {
      base64Data: input.base64Data,
      fileName: input.fileName,
      mediaType: input.mediaType ?? null,
      workspaceId: input.workspaceId,
    }) as Promise<SavedTerminalAttachment>;
  }

  async detachTerminal(terminalId: string): Promise<void> {
    await this.invoke("detach_terminal", { terminalId });
  }

  async killTerminal(terminalId: string): Promise<void> {
    await this.invoke("kill_terminal", { terminalId });
  }

  async interruptTerminal(terminalId: string): Promise<void> {
    await this.invoke("interrupt_terminal", { terminalId });
  }

  async readFile(workspaceId: string, filePath: string): Promise<WorkspaceFileReadResult> {
    return this.invoke("read_workspace_file", {
      workspaceId,
      filePath,
    }) as Promise<WorkspaceFileReadResult>;
  }

  async writeFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult> {
    return this.invoke("write_workspace_file", {
      workspaceId,
      filePath,
      content,
    }) as Promise<WorkspaceFileReadResult>;
  }

  async listFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]> {
    return this.invoke("list_workspace_files", {
      workspaceId,
    }) as Promise<WorkspaceFileTreeEntry[]>;
  }

  async openFile(workspaceId: string, filePath: string): Promise<void> {
    await this.invoke("open_workspace_file", {
      workspaceId,
      filePath,
    });
  }

  async getGitStatus(workspaceId: string): Promise<GitStatusResult> {
    return this.invoke("get_workspace_git_status", { workspaceId }) as Promise<GitStatusResult>;
  }

  async getGitScopePatch(workspaceId: string, scope: GitDiffScope): Promise<string> {
    return this.invoke("get_workspace_git_scope_patch", {
      workspaceId,
      scope,
    }) as Promise<string>;
  }

  async getGitChangesPatch(workspaceId: string): Promise<string> {
    return this.invoke("get_workspace_git_changes_patch", { workspaceId }) as Promise<string>;
  }

  async getGitDiff(input: GitDiffInput): Promise<GitDiffResult> {
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

  async getGitPullRequest(
    workspaceId: string,
    pullRequestNumber: number,
  ): Promise<GitPullRequestDetailResult> {
    return this.invoke("get_workspace_git_pull_request", {
      workspaceId,
      pullRequestNumber,
    }) as Promise<GitPullRequestDetailResult>;
  }

  async getCurrentGitPullRequest(workspaceId: string): Promise<GitBranchPullRequestResult> {
    return this.invoke("get_workspace_current_git_pull_request", {
      workspaceId,
    }) as Promise<GitBranchPullRequestResult>;
  }

  async getGitBaseRef(workspaceId: string): Promise<string | null> {
    return this.invoke("get_workspace_git_base_ref", { workspaceId }) as Promise<string | null>;
  }

  async getGitRefDiffPatch(workspaceId: string, baseRef: string, headRef: string): Promise<string> {
    return this.invoke("get_workspace_git_ref_diff_patch", {
      workspaceId,
      baseRef,
      headRef,
    }) as Promise<string>;
  }

  async getGitPullRequestPatch(workspaceId: string, pullRequestNumber: number): Promise<string> {
    return this.invoke("get_workspace_git_pull_request_patch", {
      workspaceId,
      pullRequestNumber,
    }) as Promise<string>;
  }

  async getGitCommitPatch(workspaceId: string, sha: string): Promise<GitCommitDiffResult> {
    return this.invoke("get_workspace_git_commit_patch", {
      workspaceId,
      sha,
    }) as Promise<GitCommitDiffResult>;
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

  private async invokeStartServices(input: WorkspaceStartInput): Promise<void> {
    await this.invoke("start_services", {
      workspaceId: input.workspace.id,
      manifestJson: input.manifestJson,
      manifestFingerprint: input.manifestFingerprint,
      serviceNames: input.serviceNames,
    });
  }
}
