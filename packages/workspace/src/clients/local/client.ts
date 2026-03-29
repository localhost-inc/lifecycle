import {
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
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import type {
  ArchiveWorkspaceInput,
  EnsureWorkspaceInput,
  GitDiffInput,
  OpenInAppId,
  RenameWorkspaceInput,
  SubscribeWorkspaceFileEventsInput,
  WorkspaceFileEventListener,
  WorkspaceFileEventSubscription,
  WorkspaceArchiveDisposition,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceClient,
  WorkspaceOpenInAppInfo,
} from "../../workspace";
import { readManifestFromPath, type FileReader, type ManifestStatus } from "../../manifest";
import { computeArchiveInput } from "../../policy/workspace-archive";
import { computeRenameInput } from "../../policy/workspace-rename";

export interface LocalClientDeps {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  fileReader?: FileReader;
  watchPath?: (
    path: string,
    callback: () => void,
    options: { recursive: boolean; delayMs: number },
  ) => Promise<() => void>;
}

function requireWorktreePath(workspace: WorkspaceRecord): string {
  if (!workspace.worktree_path) {
    throw new Error(`Workspace "${workspace.id}" has no worktree path.`);
  }
  return workspace.worktree_path;
}

export class LocalWorkspaceClient implements WorkspaceClient {
  private fileReader: FileReader | undefined;
  private invoke: LocalClientDeps["invoke"];
  private watchPath: LocalClientDeps["watchPath"];
  constructor(deps: LocalClientDeps) {
    this.fileReader = deps.fileReader;
    this.invoke = deps.invoke;
    this.watchPath = deps.watchPath;
  }

  async readManifest(dirPath: string): Promise<ManifestStatus> {
    if (!this.fileReader) {
      return { state: "missing" };
    }

    return readManifestFromPath(dirPath, this.fileReader);
  }

  async getGitCurrentBranch(repoPath: string): Promise<string> {
    return this.invoke("get_git_current_branch", { repoPath }) as Promise<string>;
  }

  async ensureWorkspace(input: EnsureWorkspaceInput): Promise<WorkspaceRecord> {
    const workspace = input.workspace;
    const isRoot = workspace.checkout_type === "root";

    let worktreePath: string;
    let gitSha: string | null = null;

    if (isRoot) {
      worktreePath = input.projectPath;
      try {
        gitSha = (await this.invoke("get_git_sha", {
          repoPath: input.projectPath,
          refName: workspace.source_ref,
        })) as string;
      } catch {
        // SHA lookup is best-effort for root workspaces.
      }
    } else {
      const baseRef =
        input.baseRef ??
        ((await this.invoke("get_git_current_branch", {
          repoPath: input.projectPath,
        })) as string);

      worktreePath = (await this.invoke("create_git_worktree", {
        repoPath: input.projectPath,
        baseRef,
        branch: workspace.source_ref,
        name: workspace.name,
        id: workspace.id,
        worktreeRoot: input.worktreeRoot ?? null,
        copyConfigFiles: true,
      })) as string;

      try {
        gitSha = (await this.invoke("get_git_sha", {
          repoPath: input.projectPath,
          refName: workspace.source_ref,
        })) as string;
      } catch {
        // SHA lookup is best-effort.
      }
    }

    const now = new Date().toISOString();
    return {
      ...workspace,
      git_sha: gitSha,
      manifest_fingerprint: input.manifestFingerprint ?? null,
      worktree_path: worktreePath,
      status: "active",
      failure_reason: null,
      failed_at: null,
      updated_at: now,
      last_active_at: now,
    };
  }

  async renameWorkspace(input: RenameWorkspaceInput): Promise<WorkspaceRecord> {
    const { workspace, projectPath, name } = input;
    let branchHasUpstream = false;
    let currentWorktreeBranch: string | null = null;
    if (workspace.worktree_path) {
      try {
        [currentWorktreeBranch, branchHasUpstream] = await Promise.all([
          this.getGitCurrentBranch(workspace.worktree_path),
          this.invoke("git_branch_has_upstream", {
            worktreePath: workspace.worktree_path,
            branchName: workspace.source_ref,
          }) as Promise<boolean>,
        ]);
      } catch {
        // If we can't check, skip branch rename (safe default)
      }
    }

    const renameInput = computeRenameInput(
      workspace,
      name,
      branchHasUpstream,
      currentWorktreeBranch,
    );

    const result = (await this.invoke("rename_git_worktree_branch", {
      worktreePath: workspace.worktree_path ?? "",
      currentSourceRef: workspace.source_ref,
      newSourceRef: renameInput.sourceRef,
      renameBranch: renameInput.renameBranch,
      moveWorktree: renameInput.moveWorktree,
      repoPath: projectPath,
      name: renameInput.name,
      id: workspace.id,
    })) as string | null;

    const now = new Date().toISOString();
    return {
      ...workspace,
      name: renameInput.name,
      source_ref: renameInput.sourceRef,
      worktree_path: result ?? workspace.worktree_path,
      updated_at: now,
      last_active_at: now,
    };
  }

  async inspectArchive(workspace: WorkspaceRecord): Promise<WorkspaceArchiveDisposition> {
    if (
      (workspace.host !== "local" && workspace.host !== "docker") ||
      workspace.worktree_path === null
    ) {
      return { hasUncommittedChanges: false };
    }

    const gitStatus = await this.getGitStatus(workspace);
    return {
      hasUncommittedChanges: gitStatus.files.length > 0,
    };
  }

  async archiveWorkspace(input: ArchiveWorkspaceInput): Promise<void> {
    const { workspace, projectPath } = input;
    const lifecycleRoot = (await this.invoke("resolve_lifecycle_root_path")) as string;
    const archiveInput = computeArchiveInput(workspace, lifecycleRoot);

    if (archiveInput.removeWorktree && workspace.worktree_path) {
      await this.invoke("remove_git_worktree", {
        repoPath: projectPath,
        worktreePath: workspace.worktree_path,
      });
    }

    if (archiveInput.attachmentPath) {
      // Attachment cleanup is best-effort — TS handles this.
    }
  }

  async readFile(workspace: WorkspaceRecord, filePath: string): Promise<WorkspaceFileReadResult> {
    return this.invoke("read_file", {
      rootPath: requireWorktreePath(workspace),
      filePath,
    }) as Promise<WorkspaceFileReadResult>;
  }

  async writeFile(
    workspace: WorkspaceRecord,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult> {
    return this.invoke("write_file", {
      rootPath: requireWorktreePath(workspace),
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
        () => {
          if (!disposed) emitChanged();
        },
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

  async listFiles(workspace: WorkspaceRecord): Promise<WorkspaceFileTreeEntry[]> {
    return this.invoke("list_files", {
      rootPath: requireWorktreePath(workspace),
    }) as Promise<WorkspaceFileTreeEntry[]>;
  }

  async openFile(workspace: WorkspaceRecord, filePath: string): Promise<void> {
    await this.invoke("open_file", {
      rootPath: requireWorktreePath(workspace),
      filePath,
    });
  }

  async openInApp(workspace: WorkspaceRecord, appId: OpenInAppId): Promise<void> {
    await this.invoke("open_in_app", {
      rootPath: requireWorktreePath(workspace),
      appId,
    });
  }

  async listOpenInApps(): Promise<WorkspaceOpenInAppInfo[]> {
    const apps = (await this.invoke("list_open_in_apps")) as Array<{
      icon_data_url: string | null;
      id: OpenInAppId;
      label: string;
    }>;
    return apps.map((app) => ({
      iconDataUrl: app.icon_data_url,
      id: app.id,
      label: app.label,
    }));
  }

  async getGitStatus(workspace: WorkspaceRecord): Promise<GitStatusResult> {
    return this.invoke("get_git_status", {
      repoPath: requireWorktreePath(workspace),
    }) as Promise<GitStatusResult>;
  }

  async getGitScopePatch(workspace: WorkspaceRecord, scope: GitDiffScope): Promise<string> {
    return this.invoke("get_git_scope_patch", {
      repoPath: requireWorktreePath(workspace),
      scope,
    }) as Promise<string>;
  }

  async getGitChangesPatch(workspace: WorkspaceRecord): Promise<string> {
    return this.invoke("get_git_changes_patch", {
      repoPath: requireWorktreePath(workspace),
    }) as Promise<string>;
  }

  async getGitDiff(input: GitDiffInput): Promise<GitDiffResult> {
    return this.invoke("get_git_diff", {
      repoPath: requireWorktreePath(input.workspace),
      filePath: input.filePath,
      scope: input.scope,
    }) as Promise<GitDiffResult>;
  }

  async listGitLog(workspace: WorkspaceRecord, limit: number): Promise<GitLogEntry[]> {
    return this.invoke("list_git_log", {
      repoPath: requireWorktreePath(workspace),
      limit,
    }) as Promise<GitLogEntry[]>;
  }

  async listGitPullRequests(workspace: WorkspaceRecord): Promise<GitPullRequestListResult> {
    return this.invoke("list_git_pull_requests", {
      repoPath: requireWorktreePath(workspace),
    }) as Promise<GitPullRequestListResult>;
  }

  async getGitPullRequest(
    workspace: WorkspaceRecord,
    pullRequestNumber: number,
  ): Promise<GitPullRequestDetailResult> {
    return this.invoke("get_git_pull_request", {
      repoPath: requireWorktreePath(workspace),
      pullRequestNumber,
    }) as Promise<GitPullRequestDetailResult>;
  }

  async getCurrentGitPullRequest(workspace: WorkspaceRecord): Promise<GitBranchPullRequestResult> {
    return this.invoke("get_current_git_pull_request", {
      repoPath: requireWorktreePath(workspace),
    }) as Promise<GitBranchPullRequestResult>;
  }

  async getGitBaseRef(workspace: WorkspaceRecord): Promise<string | null> {
    return this.invoke("get_git_base_ref", {
      repoPath: requireWorktreePath(workspace),
    }) as Promise<string | null>;
  }

  async getGitRefDiffPatch(
    workspace: WorkspaceRecord,
    baseRef: string,
    headRef: string,
  ): Promise<string> {
    return this.invoke("get_git_ref_diff_patch", {
      repoPath: requireWorktreePath(workspace),
      baseRef,
      headRef,
    }) as Promise<string>;
  }

  async getGitPullRequestPatch(
    workspace: WorkspaceRecord,
    pullRequestNumber: number,
  ): Promise<string> {
    return this.invoke("get_git_pull_request_patch", {
      repoPath: requireWorktreePath(workspace),
      pullRequestNumber,
    }) as Promise<string>;
  }

  async getGitCommitPatch(workspace: WorkspaceRecord, sha: string): Promise<GitCommitDiffResult> {
    return this.invoke("get_git_commit_patch", {
      repoPath: requireWorktreePath(workspace),
      sha,
    }) as Promise<GitCommitDiffResult>;
  }

  async stageGitFiles(workspace: WorkspaceRecord, filePaths: string[]): Promise<void> {
    await this.invoke("stage_git_files", {
      repoPath: requireWorktreePath(workspace),
      filePaths,
    });
  }

  async unstageGitFiles(workspace: WorkspaceRecord, filePaths: string[]): Promise<void> {
    await this.invoke("unstage_git_files", {
      repoPath: requireWorktreePath(workspace),
      filePaths,
    });
  }

  async commitGit(workspace: WorkspaceRecord, message: string): Promise<GitCommitResult> {
    return this.invoke("commit_git", {
      repoPath: requireWorktreePath(workspace),
      message,
    }) as Promise<GitCommitResult>;
  }

  async pushGit(workspace: WorkspaceRecord): Promise<GitPushResult> {
    return this.invoke("push_git", {
      repoPath: requireWorktreePath(workspace),
    }) as Promise<GitPushResult>;
  }

  async createGitPullRequest(workspace: WorkspaceRecord): Promise<GitPullRequestSummary> {
    return this.invoke("create_git_pull_request", {
      repoPath: requireWorktreePath(workspace),
    }) as Promise<GitPullRequestSummary>;
  }

  async mergeGitPullRequest(
    workspace: WorkspaceRecord,
    pullRequestNumber: number,
  ): Promise<GitPullRequestSummary> {
    return this.invoke("merge_git_pull_request", {
      repoPath: requireWorktreePath(workspace),
      pullRequestNumber,
    }) as Promise<GitPullRequestSummary>;
  }
}
