import type {
  LifecycleConfig,
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
  WorkspaceRecord,
} from "@lifecycle/contracts";
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
  WorkspaceArchiveDisposition,
  WorkspaceHostAdapter,
  WorkspaceFileEventListener,
  WorkspaceFileEventSubscription,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceOpenInAppInfo,
  WorkspaceShellRuntime,
  StopWorkspaceStackInput,
  WorkspaceTerminalConnection,
  WorkspaceTerminalConnectionInput,
  WorkspaceTerminalRecord,
  WorkspaceTerminalRuntime,
} from "../../host";
import type { ManifestStatus } from "../../manifest";
import type { StartStackInput, StartStackResult } from "../../../stack";
import { buildCloudShellSshArgs, type CloudShellConnection } from "./shell";
import {
  buildTmuxCommand,
  buildTmuxCommandText,
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
} from "../../../terminal/tmux-runtime";

export interface CloudHostDeps {
  execWorkspaceCommand: (workspaceId: string, command: string[]) => Promise<ExecCommandResult>;
  getShellConnection: (workspaceId: string) => Promise<CloudShellConnection>;
}

function requireWorkspaceId(workspace: WorkspaceRecord): string {
  if (!workspace.id) {
    throw new Error("Cloud workspace commands require a workspace id.");
  }
  return workspace.id;
}

function unsupported(method: string): never {
  throw new Error(`CloudWorkspaceHost.${method} is not implemented in Lifecycle bridge yet.`);
}

export class CloudWorkspaceHost implements WorkspaceHostAdapter {
  private execWorkspaceCommand: CloudHostDeps["execWorkspaceCommand"];
  private getShellConnection: CloudHostDeps["getShellConnection"];

  constructor(deps: CloudHostDeps) {
    this.execWorkspaceCommand = deps.execWorkspaceCommand;
    this.getShellConnection = deps.getShellConnection;
  }

  async execCommand(workspace: WorkspaceRecord, command: string[]): Promise<ExecCommandResult> {
    return this.execWorkspaceCommand(requireWorkspaceId(workspace), command);
  }

  async resolveShellRuntime(
    workspace: WorkspaceRecord,
    input: ResolveWorkspaceShellInput = {},
  ): Promise<WorkspaceShellRuntime> {
    const workspaceId = requireWorkspaceId(workspace);
    const connection = await this.getShellConnection(workspaceId);
    const sessionName = input.sessionName?.trim() || null;
    const syncEnvironment = (input.syncEnvironment ?? [])
      .map((command) => command.trim())
      .filter((command) => command.length > 0);
    const tmuxProfile = resolveTmuxRuntimeProfile(input);

    if (!sessionName) {
      return {
        backendLabel: "cloud shell",
        launchError: null,
        persistent: false,
        sessionName: null,
        prepare:
          syncEnvironment.length > 0
            ? {
                program: "ssh",
                args: buildCloudShellSshArgs(connection, {
                  entryCommandText: [...syncEnvironment, "exit"].join("; "),
                }),
                cwd: null,
                env: [],
              }
            : null,
        spec: {
          program: "ssh",
          args: buildCloudShellSshArgs(connection),
          cwd: null,
          env: [],
        },
      };
    }

    if (tmuxProfile.backend !== "tmux") {
      return {
        backendLabel: "cloud shell",
        launchError: unsupportedPersistenceBackendError(tmuxProfile.backend),
        persistent: false,
        sessionName: null,
        prepare: null,
        spec: null,
      };
    }

    const cwd = input.cwd ?? connection.cwd ?? "/workspace";
    const prepareCommand = [
      ...syncEnvironment,
      buildEnsureTmuxSessionCommand(tmuxProfile, sessionName, cwd),
      "exit",
    ].join("; ");
    const attachCommand = buildTmuxCommandText(tmuxProfile, ["attach-session", "-t", sessionName]);

    return {
      backendLabel: "cloud tmux",
      launchError: null,
      persistent: true,
      sessionName,
      prepare: {
        program: "ssh",
        args: buildCloudShellSshArgs(connection, {
          entryCommandText: prepareCommand,
        }),
        cwd: null,
        env: [],
      },
      spec: {
        program: "ssh",
        args: buildCloudShellSshArgs(connection, {
          entryCommandText: attachCommand,
        }),
        cwd: null,
        env: [],
      },
    };
  }

  async resolveTerminalRuntime(
    workspace: WorkspaceRecord,
    input: ResolveWorkspaceTerminalRuntimeInput = {},
  ): Promise<WorkspaceTerminalRuntime> {
    const sessionName = input.sessionName?.trim() || null;
    const tmuxProfile = resolveTmuxRuntimeProfile(input);
    if (!sessionName) {
      return {
        backendLabel: "cloud tmux",
        runtimeId: null,
        launchError: "Lifecycle could not resolve the cloud terminal runtime for this workspace.",
        persistent: false,
        supportsCreate: false,
        supportsClose: false,
        supportsConnect: false,
        supportsRename: false,
      };
    }

    if (tmuxProfile.backend !== "tmux") {
      return {
        backendLabel: "cloud shell",
        runtimeId: null,
        launchError: unsupportedPersistenceBackendError(tmuxProfile.backend),
        persistent: false,
        supportsCreate: false,
        supportsClose: false,
        supportsConnect: false,
        supportsRename: false,
      };
    }

    return {
      backendLabel: "cloud tmux",
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
    const hasSession = await this.execWorkspaceCommand(
      requireWorkspaceId(workspace),
      buildTmuxCommand(context.profile, ["has-session", "-t", context.sessionName]),
    );
    if (hasSession.exitCode !== 0) {
      return [];
    }

    const result = await this.execWorkspaceCommand(
      requireWorkspaceId(workspace),
      buildTmuxCommand(context.profile, buildTmuxListTerminalArgs(context.sessionName)),
    );
    this.throwIfCommandFailed(
      result,
      "Lifecycle could not list cloud terminals for this workspace.",
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
    const result = await this.execWorkspaceCommand(
      requireWorkspaceId(workspace),
      buildTmuxCommand(
        context.profile,
        buildTmuxCreateTerminalArgs(context.sessionName, context.cwd, title, input.launchSpec),
      ),
    );
    this.throwIfCommandFailed(
      result,
      "Lifecycle could not create a cloud terminal for this workspace.",
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
          "Lifecycle could not resolve the created cloud terminal from the runtime listing.",
        );
      }

      throw new Error(`Lifecycle could not resolve the created cloud terminal "${createdId}".`);
    }

    return created;
  }

  async closeTerminal(
    workspace: WorkspaceRecord,
    terminalId: string,
    input: ResolveWorkspaceTerminalRuntimeInput = {},
  ): Promise<void> {
    const context = await this.requireTerminalContext(workspace, input);

    const result = await this.execWorkspaceCommand(
      requireWorkspaceId(workspace),
      buildTmuxCommand(
        context.profile,
        buildTmuxCloseTerminalArgs(context.sessionName, terminalId),
      ),
    );
    this.throwIfCommandFailed(result, `Lifecycle could not close cloud terminal "${terminalId}".`);
  }

  async connectTerminal(
    workspace: WorkspaceRecord,
    input: WorkspaceTerminalConnectionInput & ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<WorkspaceTerminalConnection> {
    const context = await this.requireTerminalContext(workspace, input);
    const connection = await this.getShellConnection(requireWorkspaceId(workspace));
    const terminalId = normalizeTmuxTerminalId(input.terminalId);
    const connectionId = buildTmuxConnectionId(context.sessionName, input.clientId, terminalId);

    if (input.preferredTransport === "stream") {
      return {
        connectionId,
        terminalId,
        transport: null,
        launchError: "Lifecycle does not support streamed cloud terminal connections yet.",
      };
    }

    const syncEnvironment = (input.syncEnvironment ?? [])
      .map((command) => command.trim())
      .filter((command) => command.length > 0);
    const prepareCommand = [
      ...syncEnvironment,
      buildEnsureTmuxConnectionCommand(
        context.profile,
        context.sessionName,
        connectionId,
        terminalId,
        context.cwd,
      ),
      "exit",
    ].join("; ");

    return {
      connectionId,
      terminalId,
      transport: {
        kind: "spawn",
        prepare: {
          program: "ssh",
          args: buildCloudShellSshArgs(connection, {
            entryCommandText: prepareCommand,
          }),
          cwd: null,
          env: [],
        },
        spec: {
          program: "ssh",
          args: buildCloudShellSshArgs(connection, {
            entryCommandText: buildTmuxCommandText(context.profile, [
              "attach-session",
              "-t",
              connectionId,
            ]),
          }),
          cwd: null,
          env: [],
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
    const result = await this.execWorkspaceCommand(requireWorkspaceId(workspace), [
      "sh",
      "-lc",
      buildSafeKillTmuxSessionCommand(context.profile, connectionId),
    ]);
    this.throwIfCommandFailed(
      result,
      `Lifecycle could not disconnect cloud terminal connection "${connectionId}".`,
      true,
    );
  }

  async startStack(
    _workspace: WorkspaceRecord,
    _config: LifecycleConfig,
    _input: StartStackInput,
  ): Promise<StartStackResult> {
    throw unsupported("startStack");
  }

  async stopStack(_workspace: WorkspaceRecord, _input: StopWorkspaceStackInput): Promise<void> {
    throw unsupported("stopStack");
  }

  async readManifest(_dirPath: string): Promise<ManifestStatus> {
    throw unsupported("readManifest");
  }

  async getGitCurrentBranch(_repoPath: string): Promise<string> {
    throw unsupported("getGitCurrentBranch");
  }

  async ensureWorkspace(_input: EnsureWorkspaceInput): Promise<WorkspaceRecord> {
    throw unsupported("ensureWorkspace");
  }

  async renameWorkspace(_input: RenameWorkspaceInput): Promise<WorkspaceRecord> {
    throw unsupported("renameWorkspace");
  }

  async inspectArchive(_workspace: WorkspaceRecord): Promise<WorkspaceArchiveDisposition> {
    throw unsupported("inspectArchive");
  }

  async archiveWorkspace(_input: ArchiveWorkspaceInput): Promise<void> {
    throw unsupported("archiveWorkspace");
  }

  async readFile(_workspace: WorkspaceRecord, _filePath: string): Promise<WorkspaceFileReadResult> {
    throw unsupported("readFile");
  }

  async writeFile(
    _workspace: WorkspaceRecord,
    _filePath: string,
    _content: string,
  ): Promise<WorkspaceFileReadResult> {
    throw unsupported("writeFile");
  }

  async subscribeFileEvents(
    _input: SubscribeWorkspaceFileEventsInput,
    _listener: WorkspaceFileEventListener,
  ): Promise<WorkspaceFileEventSubscription> {
    throw unsupported("subscribeFileEvents");
  }

  async listFiles(_workspace: WorkspaceRecord): Promise<WorkspaceFileTreeEntry[]> {
    throw unsupported("listFiles");
  }

  async openFile(_workspace: WorkspaceRecord, _filePath: string): Promise<void> {
    throw unsupported("openFile");
  }

  async openInApp(_workspace: WorkspaceRecord, _appId: OpenInAppId): Promise<void> {
    throw unsupported("openInApp");
  }

  async listOpenInApps(): Promise<WorkspaceOpenInAppInfo[]> {
    throw unsupported("listOpenInApps");
  }

  async getGitStatus(_workspace: WorkspaceRecord): Promise<GitStatusResult> {
    throw unsupported("getGitStatus");
  }

  async getGitScopePatch(_workspace: WorkspaceRecord, _scope: GitDiffScope): Promise<string> {
    throw unsupported("getGitScopePatch");
  }

  async getGitChangesPatch(_workspace: WorkspaceRecord): Promise<string> {
    throw unsupported("getGitChangesPatch");
  }

  async getGitDiff(_input: GitDiffInput): Promise<GitDiffResult> {
    throw unsupported("getGitDiff");
  }

  async listGitLog(_workspace: WorkspaceRecord, _limit: number): Promise<GitLogEntry[]> {
    throw unsupported("listGitLog");
  }

  async listGitPullRequests(_workspace: WorkspaceRecord): Promise<GitPullRequestListResult> {
    throw unsupported("listGitPullRequests");
  }

  async getGitPullRequest(
    _workspace: WorkspaceRecord,
    _pullRequestNumber: number,
  ): Promise<GitPullRequestDetailResult> {
    throw unsupported("getGitPullRequest");
  }

  async getCurrentGitPullRequest(_workspace: WorkspaceRecord): Promise<GitBranchPullRequestResult> {
    throw unsupported("getCurrentGitPullRequest");
  }

  async getGitBaseRef(_workspace: WorkspaceRecord): Promise<string | null> {
    throw unsupported("getGitBaseRef");
  }

  async getGitRefDiffPatch(
    _workspace: WorkspaceRecord,
    _baseRef: string,
    _headRef: string,
  ): Promise<string> {
    throw unsupported("getGitRefDiffPatch");
  }

  async getGitPullRequestPatch(
    _workspace: WorkspaceRecord,
    _pullRequestNumber: number,
  ): Promise<string> {
    throw unsupported("getGitPullRequestPatch");
  }

  async getGitCommitPatch(_workspace: WorkspaceRecord, _sha: string): Promise<GitCommitDiffResult> {
    throw unsupported("getGitCommitPatch");
  }

  async stageGitFiles(_workspace: WorkspaceRecord, _filePaths: string[]): Promise<void> {
    throw unsupported("stageGitFiles");
  }

  async unstageGitFiles(_workspace: WorkspaceRecord, _filePaths: string[]): Promise<void> {
    throw unsupported("unstageGitFiles");
  }

  async commitGit(_workspace: WorkspaceRecord, _message: string): Promise<GitCommitResult> {
    throw unsupported("commitGit");
  }

  async pushGit(_workspace: WorkspaceRecord): Promise<GitPushResult> {
    throw unsupported("pushGit");
  }

  async createGitPullRequest(_workspace: WorkspaceRecord): Promise<GitPullRequestSummary> {
    throw unsupported("createGitPullRequest");
  }

  async mergeGitPullRequest(
    _workspace: WorkspaceRecord,
    _pullRequestNumber: number,
  ): Promise<GitPullRequestSummary> {
    throw unsupported("mergeGitPullRequest");
  }

  private async ensureTmuxSession(
    workspace: WorkspaceRecord,
    context: CloudTerminalContext,
  ): Promise<void> {
    const result = await this.execWorkspaceCommand(requireWorkspaceId(workspace), [
      "sh",
      "-lc",
      buildEnsureTmuxSessionCommand(context.profile, context.sessionName, context.cwd),
    ]);
    this.throwIfCommandFailed(result, "Lifecycle could not prepare the cloud terminal runtime.");
  }

  private async requireTerminalContext(
    workspace: WorkspaceRecord,
    input: ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<CloudTerminalContext> {
    const runtime = await this.resolveTerminalRuntime(workspace, input);
    if (runtime.launchError || !runtime.runtimeId) {
      throw new Error(
        runtime.launchError ??
          "Lifecycle could not resolve the cloud terminal runtime for this workspace.",
      );
    }

    const connection = await this.getShellConnection(requireWorkspaceId(workspace));
    return {
      cwd: input.cwd ?? connection.cwd ?? "/workspace",
      profile: resolveTmuxRuntimeProfile(input),
      sessionName: runtime.runtimeId,
    };
  }

  private throwIfCommandFailed(
    result: ExecCommandResult,
    message: string,
    allowMissingConnection = false,
  ): void {
    if (result.exitCode === 0) {
      return;
    }

    if (allowMissingConnection && /no server running|can't find session/i.test(result.stderr)) {
      return;
    }

    const detail = [result.stderr.trim(), result.stdout.trim()].find((value) => value.length > 0);
    throw new Error(detail ? `${message} ${detail}` : message);
  }
}

interface CloudTerminalContext {
  cwd: string;
  profile: ReturnType<typeof resolveTmuxRuntimeProfile>;
  sessionName: string;
}

function unsupportedPersistenceBackendError(backend: string): string {
  return `Lifecycle terminal persistence backend "${backend}" is not supported yet.`;
}
