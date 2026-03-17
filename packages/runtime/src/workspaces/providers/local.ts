import type {
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
  ServiceRecord,
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type {
  LocalWorkspaceProviderCreateContext,
  WorkspaceProviderFileReadResult,
  WorkspaceProviderFileTreeEntry,
  WorkspaceProvider,
  WorkspaceProviderCreateTerminalInput,
  WorkspaceProviderCreateInput,
  WorkspaceProviderCreateResult,
  WorkspaceProviderGitDiffInput,
  WorkspaceProviderHealthResult,
  WorkspaceProviderRuntimeProjectionResult,
  WorkspaceProviderSaveTerminalAttachmentInput,
  WorkspaceProviderSavedTerminalAttachment,
  WorkspaceProviderSnapshotResult,
  WorkspaceProviderStartInput,
  WorkspaceProviderSyncManifestInput,
  WorkspaceProviderUpdateServiceInput,
  WorkspaceProviderWakeInput,
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
        status: "idle",
        manifest_fingerprint: input.manifestFingerprint ?? null,
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
    await this.invokeStartServices(input);
    return input.services;
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord> {
    return this.invoke("rename_workspace", {
      workspaceId,
      name,
    }) as Promise<WorkspaceRecord>;
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

  async wake(input: WorkspaceProviderWakeInput): Promise<void> {
    await this.invokeStartServices(input);
  }

  async destroy(workspaceId: string): Promise<void> {
    await this.invoke("destroy_workspace", { workspaceId });
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    return this.invoke("get_workspace_by_id", { workspaceId }) as Promise<WorkspaceRecord | null>;
  }

  async getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]> {
    return this.invoke("get_workspace_services", { workspaceId }) as Promise<ServiceRecord[]>;
  }

  async getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceProviderSnapshotResult> {
    return this.invoke("get_workspace_snapshot", {
      workspaceId,
    }) as Promise<WorkspaceProviderSnapshotResult>;
  }

  async getWorkspaceRuntimeProjection(
    workspaceId: string,
  ): Promise<WorkspaceProviderRuntimeProjectionResult> {
    return this.invoke("get_workspace_runtime_projection", {
      workspaceId,
    }) as Promise<WorkspaceProviderRuntimeProjectionResult>;
  }

  async updateWorkspaceService(input: WorkspaceProviderUpdateServiceInput): Promise<void> {
    await this.invoke("update_workspace_service", {
      workspaceId: input.workspaceId,
      serviceName: input.serviceName,
      exposure: input.exposure,
      portOverride: input.portOverride,
    });
  }

  async syncWorkspaceManifest(input: WorkspaceProviderSyncManifestInput): Promise<void> {
    await this.invoke("sync_workspace_manifest", {
      workspaceId: input.workspaceId,
      manifestJson: input.manifestJson,
      manifestFingerprint: input.manifestFingerprint,
    });
  }

  async createTerminal(input: WorkspaceProviderCreateTerminalInput): Promise<TerminalRecord> {
    return this.invoke("create_terminal", {
      harnessLaunchConfig: input.harnessLaunchConfig ?? null,
      workspaceId: input.workspaceId,
      launchType: input.launchType,
      harnessProvider: input.harnessProvider,
      harnessSessionId: input.harnessSessionId,
    }) as Promise<TerminalRecord>;
  }

  async listWorkspaceTerminals(workspaceId: string): Promise<TerminalRecord[]> {
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
    input: WorkspaceProviderSaveTerminalAttachmentInput,
  ): Promise<WorkspaceProviderSavedTerminalAttachment> {
    return this.invoke("save_terminal_attachment", {
      base64Data: input.base64Data,
      fileName: input.fileName,
      mediaType: input.mediaType ?? null,
      workspaceId: input.workspaceId,
    }) as Promise<WorkspaceProviderSavedTerminalAttachment>;
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

  async readWorkspaceFile(
    workspaceId: string,
    filePath: string,
  ): Promise<WorkspaceProviderFileReadResult> {
    return this.invoke("read_workspace_file", {
      workspaceId,
      filePath,
    }) as Promise<WorkspaceProviderFileReadResult>;
  }

  async writeWorkspaceFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceProviderFileReadResult> {
    return this.invoke("write_workspace_file", {
      workspaceId,
      filePath,
      content,
    }) as Promise<WorkspaceProviderFileReadResult>;
  }

  async listWorkspaceFiles(workspaceId: string): Promise<WorkspaceProviderFileTreeEntry[]> {
    return this.invoke("list_workspace_files", {
      workspaceId,
    }) as Promise<WorkspaceProviderFileTreeEntry[]>;
  }

  async openWorkspaceFile(workspaceId: string, filePath: string): Promise<void> {
    await this.invoke("open_workspace_file", {
      workspaceId,
      filePath,
    });
  }

  async exposePort(workspaceId: string, serviceName: string, port: number): Promise<string | null> {
    await this.updateWorkspaceService({
      workspaceId,
      serviceName,
      exposure: "local",
      portOverride: port,
    });
    const services = await this.getWorkspaceServices(workspaceId);
    return services.find((service) => service.service_name === serviceName)?.preview_url ?? null;
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

  private async invokeStartServices(input: WorkspaceProviderStartInput): Promise<void> {
    await this.invoke("start_services", {
      workspaceId: input.workspace.id,
      manifestJson: input.manifestJson,
      manifestFingerprint: input.manifestFingerprint,
      serviceNames: input.serviceNames,
    });
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
