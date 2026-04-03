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
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type {
  ArchiveWorkspaceInput,
  EnsureWorkspaceInput,
  ExecCommandResult,
  GitDiffInput,
  OpenInAppId,
  ResolveWorkspaceShellInput,
  RenameWorkspaceInput,
  SubscribeWorkspaceFileEventsInput,
  WorkspaceArchiveDisposition,
  WorkspaceClient,
  WorkspaceFileEventListener,
  WorkspaceFileEventSubscription,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceOpenInAppInfo,
  WorkspaceShellRuntime,
} from "../../workspace";
import type { ManifestStatus } from "../../manifest";
import { buildCloudShellSshArgs, type CloudShellConnection } from "./shell";

export interface CloudClientDeps {
  execWorkspaceCommand: (
    workspaceId: string,
    command: string[],
  ) => Promise<ExecCommandResult>;
  getShellConnection: (
    workspaceId: string,
  ) => Promise<CloudShellConnection>;
}

function requireWorkspaceId(workspace: WorkspaceRecord): string {
  if (!workspace.id) {
    throw new Error("Cloud workspace commands require a workspace id.");
  }
  return workspace.id;
}

function unsupported(method: string): never {
  throw new Error(
    `CloudWorkspaceClient.${method} is not implemented in @lifecycle/workspace yet.`,
  );
}

export class CloudWorkspaceClient implements WorkspaceClient {
  private execWorkspaceCommand: CloudClientDeps["execWorkspaceCommand"];
  private getShellConnection: CloudClientDeps["getShellConnection"];

  constructor(deps: CloudClientDeps) {
    this.execWorkspaceCommand = deps.execWorkspaceCommand;
    this.getShellConnection = deps.getShellConnection;
  }

  async execCommand(
    workspace: WorkspaceRecord,
    command: string[],
  ): Promise<ExecCommandResult> {
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

    if (!sessionName) {
      return {
        backendLabel: "cloud shell",
        launchError: null,
        persistent: false,
        sessionName: null,
        prepare: syncEnvironment.length > 0
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

    const quotedSession = shellEscape(sessionName);
    const prepareCommand = [
      ...syncEnvironment,
      `tmux has-session -t ${quotedSession} 2>/dev/null || tmux new-session -d -s ${quotedSession}`,
      `printf %s ${quotedSession} > /tmp/.lifecycle-tmux-attach`,
      "exit",
    ].join("; ");

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
        args: buildCloudShellSshArgs(connection),
        cwd: null,
        env: [],
      },
    };
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

  async readFile(
    _workspace: WorkspaceRecord,
    _filePath: string,
  ): Promise<WorkspaceFileReadResult> {
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

  async getGitScopePatch(
    _workspace: WorkspaceRecord,
    _scope: GitDiffScope,
  ): Promise<string> {
    throw unsupported("getGitScopePatch");
  }

  async getGitChangesPatch(_workspace: WorkspaceRecord): Promise<string> {
    throw unsupported("getGitChangesPatch");
  }

  async getGitDiff(_input: GitDiffInput): Promise<GitDiffResult> {
    throw unsupported("getGitDiff");
  }

  async listGitLog(
    _workspace: WorkspaceRecord,
    _limit: number,
  ): Promise<GitLogEntry[]> {
    throw unsupported("listGitLog");
  }

  async listGitPullRequests(
    _workspace: WorkspaceRecord,
  ): Promise<GitPullRequestListResult> {
    throw unsupported("listGitPullRequests");
  }

  async getGitPullRequest(
    _workspace: WorkspaceRecord,
    _pullRequestNumber: number,
  ): Promise<GitPullRequestDetailResult> {
    throw unsupported("getGitPullRequest");
  }

  async getCurrentGitPullRequest(
    _workspace: WorkspaceRecord,
  ): Promise<GitBranchPullRequestResult> {
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

  async getGitCommitPatch(
    _workspace: WorkspaceRecord,
    _sha: string,
  ): Promise<GitCommitDiffResult> {
    throw unsupported("getGitCommitPatch");
  }

  async stageGitFiles(
    _workspace: WorkspaceRecord,
    _filePaths: string[],
  ): Promise<void> {
    throw unsupported("stageGitFiles");
  }

  async unstageGitFiles(
    _workspace: WorkspaceRecord,
    _filePaths: string[],
  ): Promise<void> {
    throw unsupported("unstageGitFiles");
  }

  async commitGit(
    _workspace: WorkspaceRecord,
    _message: string,
  ): Promise<GitCommitResult> {
    throw unsupported("commitGit");
  }

  async pushGit(_workspace: WorkspaceRecord): Promise<GitPushResult> {
    throw unsupported("pushGit");
  }

  async createGitPullRequest(
    _workspace: WorkspaceRecord,
  ): Promise<GitPullRequestSummary> {
    throw unsupported("createGitPullRequest");
  }

  async mergeGitPullRequest(
    _workspace: WorkspaceRecord,
    _pullRequestNumber: number,
  ): Promise<GitPullRequestSummary> {
    throw unsupported("mergeGitPullRequest");
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
