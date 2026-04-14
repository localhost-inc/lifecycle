import {
  type LifecycleConfig,
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
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { killPid, type StartStackInput, type StartStackResult } from "../../../stack";
import { LocalStackClient } from "../../../stack/clients/local";
import type {
  ArchiveWorkspaceInput,
  CreateWorkspaceTerminalInput,
  EnsureWorkspaceInput,
  ExecCommandResult,
  GitDiffInput,
  OpenInAppId,
  ResolveWorkspaceShellInput,
  ResolveWorkspaceTerminalRuntimeInput,
  RenameWorkspaceInput,
  SubscribeWorkspaceFileEventsInput,
  WorkspaceFileEventListener,
  WorkspaceFileEventSubscription,
  WorkspaceArchiveDisposition,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceHostAdapter,
  StopWorkspaceStackInput,
  WorkspaceTerminalConnection,
  WorkspaceTerminalConnectionInput,
  WorkspaceTerminalRecord,
  WorkspaceTerminalRuntime,
  WorkspaceShellRuntime,
  WorkspaceOpenInAppInfo,
} from "../../host";
import { readManifestFromPath, type FileReader, type ManifestStatus } from "../../manifest";
import { computeArchiveInput } from "../../policy/workspace-archive";
import { slugifyWorkspaceName } from "../../policy/workspace-names";
import { computeRenameInput } from "../../policy/workspace-rename";
import {
  buildTmuxLaunchEnv,
  buildTmuxCommand,
  buildEnsureTmuxConnectionCommand,
  buildEnsureTmuxSessionCommand,
  buildSafeKillTmuxSessionCommand,
  buildTmuxCloseTerminalArgs,
  buildTmuxConnectionId,
  buildTmuxCreateTerminalArgs,
  buildTmuxListTerminalArgs,
  normalizeTmuxTerminalId,
  normalizeTerminalTitle,
  parseCreatedTmuxTerminalId,
  parseTmuxTerminalRecords,
  resolveCreatedTmuxTerminal,
  resolveTmuxRuntimeProfile,
  shellEscape,
} from "../../../terminal/tmux-runtime";

export interface LocalHostDeps {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  fileReader?: FileReader;
  spawnSync?: typeof nodeSpawnSync;
  stackController?: {
    start(config: LifecycleConfig, input: StartStackInput): Promise<StartStackResult>;
    stop(stackId: string, names: string[]): Promise<void>;
  };
  watchPath?: (
    path: string,
    callback: () => void,
    options: { recursive: boolean; delayMs: number },
  ) => Promise<() => void>;
}

function requireWorktreePath(workspace: WorkspaceRecord): string {
  if (!workspace.workspace_root) {
    throw new Error(`Workspace "${workspace.id}" has no worktree path.`);
  }
  return workspace.workspace_root;
}

export class LocalWorkspaceHost implements WorkspaceHostAdapter {
  private fileReader: FileReader | undefined;
  private invoke: LocalHostDeps["invoke"];
  private stackController: NonNullable<LocalHostDeps["stackController"]>;
  private spawnSync: typeof nodeSpawnSync;
  private watchPath: LocalHostDeps["watchPath"];
  constructor(deps: LocalHostDeps) {
    this.fileReader = deps.fileReader;
    this.invoke = deps.invoke;
    this.stackController = deps.stackController ?? new LocalStackClient();
    this.spawnSync = deps.spawnSync ?? nodeSpawnSync;
    this.watchPath = deps.watchPath;
  }

  async execCommand(workspace: WorkspaceRecord, command: string[]): Promise<ExecCommandResult> {
    const cwd = requireWorktreePath(workspace);
    const [program, ...args] = command;
    if (!program) {
      return {
        stdout: "",
        stderr: "Command must include a program.",
        exitCode: 1,
      };
    }

    const result = this.spawnSync(program, args, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.error) {
      return {
        stdout: String(result.stdout ?? ""),
        stderr: result.error.message,
        exitCode: 1,
      };
    }

    return {
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      exitCode: result.status ?? 1,
    };
  }

  async resolveShellRuntime(
    workspace: WorkspaceRecord,
    input: ResolveWorkspaceShellInput = {},
  ): Promise<WorkspaceShellRuntime> {
    const cwd = input.cwd ?? workspace.workspace_root ?? null;
    const sessionName = input.sessionName?.trim() || null;
    const tmuxProfile = resolveTmuxRuntimeProfile(input);

    if (!cwd) {
      return {
        backendLabel: sessionName ? "local tmux" : "local shell",
        launchError:
          "Lifecycle could not resolve a local working directory for this shell session.",
        persistent: false,
        sessionName: null,
        prepare: null,
        spec: null,
      };
    }

    if (!sessionName) {
      return {
        backendLabel: "local shell",
        launchError: null,
        persistent: false,
        sessionName: null,
        prepare: null,
        spec: {
          program: process.env.SHELL || "/bin/bash",
          args: [],
          cwd,
          env: [["TERM", "xterm-256color"]],
        },
      };
    }

    if (tmuxProfile.backend !== "tmux") {
      return {
        backendLabel: "local shell",
        launchError: unsupportedPersistenceBackendError(tmuxProfile.backend),
        persistent: false,
        sessionName: null,
        prepare: null,
        spec: null,
      };
    }

    if (!this.commandAvailable(tmuxProfile.program)) {
      return {
        backendLabel: "local tmux",
        launchError: `${tmuxProfile.program} is required for the Lifecycle TUI local shell. Install tmux or launch from an environment where tmux is available.`,
        persistent: false,
        sessionName: null,
        prepare: null,
        spec: null,
      };
    }

    const args = [
      ...tmuxProfile.baseArgs,
      "new-session",
      "-A",
      "-s",
      sessionName,
      "-c",
      cwd,
      ...(tmuxProfile.mode === "managed"
        ? [";", "set-option", "-t", sessionName, "status", "off"]
        : []),
      ";",
      "set-option",
      "-t",
      sessionName,
      "window-size",
      "latest",
    ];

    return {
      backendLabel: "local tmux",
      launchError: null,
      persistent: true,
      sessionName,
      prepare: null,
      spec: {
        program: tmuxProfile.program,
        args,
        cwd,
        env: buildTmuxLaunchEnv(tmuxProfile),
      },
    };
  }

  async resolveTerminalRuntime(
    workspace: WorkspaceRecord,
    input: ResolveWorkspaceTerminalRuntimeInput = {},
  ): Promise<WorkspaceTerminalRuntime> {
    const cwd = input.cwd ?? workspace.workspace_root ?? null;
    const sessionName = input.sessionName?.trim() || null;
    const tmuxProfile = resolveTmuxRuntimeProfile(input);

    if (!cwd || !sessionName) {
      return {
        backendLabel: "local tmux",
        runtimeId: null,
        launchError: "Lifecycle could not resolve the local terminal runtime for this workspace.",
        persistent: false,
        supportsCreate: false,
        supportsClose: false,
        supportsConnect: false,
        supportsRename: false,
      };
    }

    if (tmuxProfile.backend !== "tmux") {
      return {
        backendLabel: "local shell",
        runtimeId: null,
        launchError: unsupportedPersistenceBackendError(tmuxProfile.backend),
        persistent: false,
        supportsCreate: false,
        supportsClose: false,
        supportsConnect: false,
        supportsRename: false,
      };
    }

    if (!this.commandAvailable(tmuxProfile.program)) {
      return {
        backendLabel: "local tmux",
        runtimeId: null,
        launchError: `${tmuxProfile.program} is required for the Lifecycle local terminal runtime. Install tmux or launch from an environment where tmux is available.`,
        persistent: false,
        supportsCreate: false,
        supportsClose: false,
        supportsConnect: false,
        supportsRename: false,
      };
    }

    return {
      backendLabel: "local tmux",
      runtimeId: sessionName,
      launchError: null,
      persistent: true,
      supportsCreate: true,
      supportsClose: true,
      supportsConnect: true,
      supportsRename: false,
    };
  }

  async listTerminals(
    workspace: WorkspaceRecord,
    input: ResolveWorkspaceTerminalRuntimeInput = {},
  ): Promise<WorkspaceTerminalRecord[]> {
    const context = await this.requireTerminalContext(workspace, input);

    // Check if the session exists without creating it.
    const hasSession = await this.execCommand(
      workspace,
      buildTmuxCommand(context.profile, ["has-session", "-t", context.sessionName]),
    );
    if (hasSession.exitCode !== 0) {
      return [];
    }

    const result = await this.execCommand(
      workspace,
      buildTmuxCommand(context.profile, buildTmuxListTerminalArgs(context.sessionName)),
    );
    this.throwIfCommandFailed(
      result,
      "Lifecycle could not list local terminals for this workspace.",
    );
    return parseTmuxTerminalRecords(result.stdout);
  }

  async createTerminal(
    workspace: WorkspaceRecord,
    input: CreateWorkspaceTerminalInput = {},
  ): Promise<WorkspaceTerminalRecord> {
    const context = await this.requireTerminalContext(workspace, input);
    await this.ensureTmuxSession(workspace, context);
    const previousTerminalIds = new Set(
      (await this.listTerminals(workspace, input)).map((terminal) => terminal.id),
    );

    const title = normalizeTerminalTitle(input.title, input.kind);
    const result = await this.execCommand(
      workspace,
      buildTmuxCommand(
        context.profile,
        buildTmuxCreateTerminalArgs(context.sessionName, context.cwd, title, input.launchSpec),
      ),
    );
    this.throwIfCommandFailed(
      result,
      "Lifecycle could not create a local terminal for this workspace.",
    );

    const createdId = parseCreatedTmuxTerminalId(result.stdout);
    const created = await resolveCreatedTmuxTerminal(
      () => this.listTerminals(workspace, input),
      (terminal) => terminal.id,
      {
        createdId,
        previousTerminalIds,
      },
    );
    if (!created) {
      if (!createdId) {
        throw new Error(
          "Lifecycle could not resolve the created local terminal from the runtime listing.",
        );
      }

      throw new Error(`Lifecycle could not resolve the created local terminal "${createdId}".`);
    }

    return created;
  }

  async closeTerminal(
    workspace: WorkspaceRecord,
    terminalId: string,
    input: ResolveWorkspaceTerminalRuntimeInput = {},
  ): Promise<void> {
    const context = await this.requireTerminalContext(workspace, input);

    const result = await this.execCommand(
      workspace,
      buildTmuxCommand(
        context.profile,
        buildTmuxCloseTerminalArgs(context.sessionName, terminalId),
      ),
    );
    this.throwIfCommandFailed(result, `Lifecycle could not close local terminal "${terminalId}".`);
  }

  async connectTerminal(
    workspace: WorkspaceRecord,
    input: WorkspaceTerminalConnectionInput & ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<WorkspaceTerminalConnection> {
    const context = await this.requireTerminalContext(workspace, input);
    const terminalId = normalizeTmuxTerminalId(input.terminalId);
    const connectionId = buildTmuxConnectionId(context.sessionName, input.clientId, terminalId);

    if (input.preferredTransport === "stream") {
      return {
        connectionId,
        terminalId,
        transport: null,
        launchError: "Lifecycle does not support streamed local terminal connections yet.",
      };
    }

    return {
      connectionId,
      terminalId,
      transport: {
        kind: "spawn",
        prepare: {
          program: "sh",
          args: [
            "-lc",
            buildEnsureTmuxConnectionCommand(
              context.profile,
              context.sessionName,
              connectionId,
              terminalId,
              context.cwd,
            ),
          ],
          cwd: context.cwd,
          env: buildTmuxLaunchEnv(context.profile),
        },
        spec: {
          program: context.profile.program,
          args: [...context.profile.baseArgs, "attach-session", "-t", connectionId],
          cwd: context.cwd,
          env: buildTmuxLaunchEnv(context.profile),
        },
      },
      launchError: null,
    };
  }

  async disconnectTerminal(
    workspace: WorkspaceRecord,
    connectionId: string,
    input: ResolveWorkspaceTerminalRuntimeInput = {},
  ): Promise<void> {
    const context = await this.requireTerminalContext(workspace, input);
    const result = await this.execCommand(workspace, [
      "sh",
      "-lc",
      buildSafeKillTmuxSessionCommand(context.profile, connectionId),
    ]);
    this.throwIfCommandFailed(
      result,
      `Lifecycle could not disconnect local terminal connection "${connectionId}".`,
      { allowNoopSuccess: true },
    );
  }

  async startStack(
    _workspace: WorkspaceRecord,
    config: LifecycleConfig,
    input: StartStackInput,
  ): Promise<StartStackResult> {
    return this.stackController.start(config, input);
  }

  async stopStack(workspace: WorkspaceRecord, input: StopWorkspaceStackInput): Promise<void> {
    for (const pid of input.processIds ?? []) {
      killPid(pid);
    }
    await this.stackController.stop(workspace.id, input.names);
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

    let workspaceRoot: string;
    let gitSha: string | null = null;

    if (isRoot) {
      workspaceRoot = input.projectPath;
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

      workspaceRoot = (await this.invoke("create_git_worktree", {
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
      workspace_root: workspaceRoot,
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
    if (workspace.workspace_root) {
      try {
        [currentWorktreeBranch, branchHasUpstream] = await Promise.all([
          this.getGitCurrentBranch(workspace.workspace_root),
          this.invoke("git_branch_has_upstream", {
            workspaceRoot: workspace.workspace_root,
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
      workspaceRoot: workspace.workspace_root ?? "",
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
      slug: slugifyWorkspaceName(renameInput.name),
      source_ref: renameInput.sourceRef,
      workspace_root: result ?? workspace.workspace_root,
      updated_at: now,
      last_active_at: now,
    };
  }

  async inspectArchive(workspace: WorkspaceRecord): Promise<WorkspaceArchiveDisposition> {
    if (
      (workspace.host !== "local" && workspace.host !== "docker") ||
      workspace.workspace_root === null
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

    if (archiveInput.removeWorktree && workspace.workspace_root) {
      await this.invoke("remove_git_worktree", {
        repoPath: projectPath,
        workspaceRoot: workspace.workspace_root,
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
    if (!this.watchPath || !input.workspaceRoot) {
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
        input.workspaceRoot,
        () => {
          if (!disposed) emitChanged();
        },
        { recursive: true, delayMs: 150 },
      );
    } catch (error) {
      console.error("Failed to watch workspace file tree:", input.workspaceRoot, error);
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

  private async ensureTmuxSession(
    workspace: WorkspaceRecord,
    context: LocalTerminalContext,
  ): Promise<void> {
    const result = await this.execCommand(workspace, [
      "sh",
      "-lc",
      buildEnsureTmuxSessionCommand(context.profile, context.sessionName, context.cwd),
    ]);
    this.throwIfCommandFailed(result, "Lifecycle could not prepare the local terminal runtime.");
  }

  private commandAvailable(program: string): boolean {
    const result = this.spawnSync(
      "sh",
      ["-lc", `command -v ${shellEscape(program)} >/dev/null 2>&1`],
      {
        stdio: "ignore",
      },
    );
    return result.status === 0;
  }

  private async requireTerminalContext(
    workspace: WorkspaceRecord,
    input: ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<LocalTerminalContext> {
    const runtime = await this.resolveTerminalRuntime(workspace, input);
    if (runtime.launchError || !runtime.runtimeId) {
      throw new Error(
        runtime.launchError ??
          "Lifecycle could not resolve the local terminal runtime for this workspace.",
      );
    }

    return {
      cwd: input.cwd ?? requireWorktreePath(workspace),
      profile: resolveTmuxRuntimeProfile(input),
      sessionName: runtime.runtimeId,
    };
  }

  private throwIfCommandFailed(
    result: ExecCommandResult,
    message: string,
    options?: { allowNoopSuccess?: boolean },
  ): void {
    if (result.exitCode === 0) {
      return;
    }

    if (options?.allowNoopSuccess && /no server running|can't find session/i.test(result.stderr)) {
      return;
    }

    const detail = [result.stderr.trim(), result.stdout.trim()].find((value) => value.length > 0);
    throw new Error(detail ? `${message} ${detail}` : message);
  }
}

interface LocalTerminalContext {
  cwd: string;
  profile: ReturnType<typeof resolveTmuxRuntimeProfile>;
  sessionName: string;
}

function unsupportedPersistenceBackendError(backend: string): string {
  return `Lifecycle terminal persistence backend "${backend}" is not supported yet.`;
}
