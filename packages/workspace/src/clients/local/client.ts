import {
  parseManifest,
  type GitBranchPullRequestResult,
  type GitCommitDiffResult,
  type GitCommitResult,
  type GitDiffResult,
  type GitDiffScope,
  type GitLogEntry,
  type GitPullRequestDetailResult,
  type GitPullRequestListResult,
  type GitPullRequestSummary,
  type GitPushResult,
  type GitStatusResult,
  type LifecycleEvent,
  type ServiceRecord,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import type {
  StartServicesInput,
  GitDiffInput,
  SubscribeWorkspaceFileEventsInput,
  WorkspaceClient,
  WorkspaceCreateInput,
  WorkspaceCreateResult,
  ServiceLogSnapshot,
  WorkspaceFileEventListener,
  WorkspaceFileEventSubscription,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceHealthResult,
} from "../../workspace";
import { LocalEnvironmentOrchestrator } from "./environment-client";

export interface LocalClientDeps {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  watchPath?: (
    path: string,
    callback: () => void,
    options: { recursive: boolean; delayMs: number },
  ) => Promise<() => void>;
}

export class LocalClient implements WorkspaceClient {
  private invoke: LocalClientDeps["invoke"];
  private watchPath: LocalClientDeps["watchPath"];
  private environment: LocalEnvironmentOrchestrator;

  constructor(deps: LocalClientDeps) {
    this.invoke = deps.invoke;
    this.watchPath = deps.watchPath;
    this.environment = new LocalEnvironmentOrchestrator(deps.invoke);
  }

  async startServices(input: StartServicesInput): Promise<ServiceRecord[]> {
    const result = parseManifest(input.manifestJson);
    if (!result.valid) {
      throw new Error(
        `Invalid manifest: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    this.environment.activeManifestJson = input.manifestJson;
    await this.environment.start(result.config, {
      workspaceId: input.workspace.id,
      manifestJson: input.manifestJson,
      manifestFingerprint: input.manifestFingerprint,
      ...(input.serviceNames ? { serviceNames: input.serviceNames } : {}),
    });

    return this.getServices(input.workspace.id);
  }

  async healthCheck(workspaceId: string): Promise<WorkspaceHealthResult> {
    const services = (await this.invoke("get_workspace_services", {
      workspaceId,
    })) as ServiceRecord[];
    const healthy = services.every((s) => s.status === "ready");
    return { healthy, services };
  }

  async stopServices(workspaceId: string): Promise<void> {
    await this.environment.stop(workspaceId);
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

  async subscribeFileEvents(
    input: SubscribeWorkspaceFileEventsInput,
    listener: WorkspaceFileEventListener,
  ): Promise<WorkspaceFileEventSubscription> {
    if (!this.watchPath || !input.worktreePath) {
      return () => {};
    }

    let disposed = false;
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const emitChanged = () => {
      if (refreshTimeout !== null) {
        clearTimeout(refreshTimeout);
      }
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        listener({ kind: "changed", workspaceId: input.workspaceId });
      }, 100);
    };

    let unwatch: (() => void) | undefined;
    try {
      unwatch = await this.watchPath(
        input.worktreePath,
        () => { if (!disposed) emitChanged(); },
        { recursive: true, delayMs: 150 },
      );
    } catch (error) {
      console.error("Failed to watch workspace file tree:", input.worktreePath, error);
    }

    return () => {
      disposed = true;
      if (refreshTimeout !== null) clearTimeout(refreshTimeout);
      unwatch?.();
    };
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

  async createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult> {
    const context = input.context;
    return this.invoke("create_workspace", {
      input: {
        host: context.host,
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
    return this.invoke("rename_workspace", { workspaceId, name }) as Promise<WorkspaceRecord>;
  }

  async archiveWorkspace(workspaceId: string): Promise<void> {
    await this.invoke("archive_workspace", { workspaceId });
  }

  async readManifestText(dirPath: string): Promise<string | null> {
    return this.invoke("read_manifest_text", { dirPath }) as Promise<string | null>;
  }

  async getCurrentBranch(projectPath: string): Promise<string> {
    return this.invoke("get_current_branch", { projectPath }) as Promise<string>;
  }

  async cleanupProject(projectId: string): Promise<void> {
    await this.invoke("cleanup_project", { id: projectId });
  }

}
