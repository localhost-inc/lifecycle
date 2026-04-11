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
  LifecycleConfig,
  LifecycleTerminalPersistenceBackend,
  LifecycleTerminalPersistenceMode,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { StartStackInput, StartStackResult } from "../stack";
import type { ManifestStatus } from "./manifest";

export interface GitDiffInput {
  workspace: WorkspaceRecord;
  filePath: string;
  scope: GitDiffScope;
}

export interface WorkspaceFileReadResult {
  absolute_path: string;
  byte_len: number;
  content: string | null;
  extension: string | null;
  file_path: string;
  is_binary: boolean;
  is_too_large: boolean;
}

export interface WorkspaceFileTreeEntry {
  extension: string | null;
  file_path: string;
}

export interface WorkspaceFileEvent {
  kind: "changed";
  workspaceId: string;
}

export type WorkspaceFileEventListener = (event: WorkspaceFileEvent) => void;
export type WorkspaceFileEventSubscription = () => void;

export interface SubscribeWorkspaceFileEventsInput {
  workspaceId: string;
  workspaceRoot?: string | null;
}

export interface EnsureWorkspaceInput {
  workspace: WorkspaceRecord;
  projectPath: string;
  baseRef?: string | null;
  worktreeRoot?: string | null;
  manifestFingerprint?: string | null;
}

export interface RenameWorkspaceInput {
  workspace: WorkspaceRecord;
  projectPath: string;
  name: string;
}

export interface WorkspaceArchiveDisposition {
  hasUncommittedChanges: boolean;
}

export interface ArchiveWorkspaceInput {
  workspace: WorkspaceRecord;
  projectPath: string;
}

export type OpenInAppId =
  | "cursor"
  | "finder"
  | "ghostty"
  | "iterm"
  | "vscode"
  | "warp"
  | "windsurf"
  | "xcode"
  | "zed";

export interface WorkspaceOpenInAppInfo {
  iconDataUrl: string | null;
  id: OpenInAppId;
  label: string;
}

export interface ExecCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WorkspaceShellLaunchSpec {
  program: string;
  args: string[];
  cwd: string | null;
  env: Array<[string, string]>;
}

export interface WorkspaceTerminalPersistenceRuntimeInput {
  persistenceBackend?: LifecycleTerminalPersistenceBackend;
  persistenceMode?: LifecycleTerminalPersistenceMode;
  persistenceExecutablePath?: string | null;
}

export interface ResolveWorkspaceShellInput extends WorkspaceTerminalPersistenceRuntimeInput {
  cwd?: string | null;
  sessionName?: string | null;
  syncEnvironment?: string[];
}

export interface WorkspaceShellRuntime {
  backendLabel: string;
  launchError: string | null;
  persistent: boolean;
  sessionName: string | null;
  prepare: WorkspaceShellLaunchSpec | null;
  spec: WorkspaceShellLaunchSpec | null;
}

export interface ResolveWorkspaceTerminalRuntimeInput extends WorkspaceTerminalPersistenceRuntimeInput {
  cwd?: string | null;
  sessionName?: string | null;
  syncEnvironment?: string[];
}

export interface WorkspaceTerminalRuntime {
  backendLabel: string;
  runtimeId: string | null;
  launchError: string | null;
  persistent: boolean;
  supportsCreate: boolean;
  supportsClose: boolean;
  supportsConnect: boolean;
  supportsRename: boolean;
}

export type WorkspaceTerminalKind = "shell" | "claude" | "codex" | "custom";

export interface WorkspaceTerminalRecord {
  id: string;
  title: string;
  kind: WorkspaceTerminalKind;
  busy: boolean;
}

export interface CreateWorkspaceTerminalInput extends ResolveWorkspaceTerminalRuntimeInput {
  kind?: WorkspaceTerminalKind;
  title?: string | null;
}

export interface WorkspaceTerminalConnectionInput {
  terminalId: string;
  clientId: string;
  access: "interactive" | "observe";
  preferredTransport: "spawn" | "stream";
}

export type WorkspaceTerminalTransport =
  | {
      kind: "spawn";
      prepare: WorkspaceShellLaunchSpec | null;
      spec: WorkspaceShellLaunchSpec | null;
    }
  | {
      kind: "stream";
      streamId: string;
      websocketPath: string;
      token: string;
      protocol: "vt";
    };

export interface WorkspaceTerminalConnection {
  connectionId: string;
  terminalId: string;
  transport: WorkspaceTerminalTransport | null;
  launchError: string | null;
}

export interface StopWorkspaceStackInput {
  names: string[];
  processIds?: number[];
}

export interface WorkspaceHostAdapter {
  execCommand(workspace: WorkspaceRecord, command: string[]): Promise<ExecCommandResult>;
  resolveShellRuntime(
    workspace: WorkspaceRecord,
    input?: ResolveWorkspaceShellInput,
  ): Promise<WorkspaceShellRuntime>;
  resolveTerminalRuntime(
    workspace: WorkspaceRecord,
    input?: ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<WorkspaceTerminalRuntime>;
  listTerminals(
    workspace: WorkspaceRecord,
    input?: ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<WorkspaceTerminalRecord[]>;
  createTerminal(
    workspace: WorkspaceRecord,
    input?: CreateWorkspaceTerminalInput,
  ): Promise<WorkspaceTerminalRecord>;
  closeTerminal(
    workspace: WorkspaceRecord,
    terminalId: string,
    input?: ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<void>;
  connectTerminal(
    workspace: WorkspaceRecord,
    input: WorkspaceTerminalConnectionInput & ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<WorkspaceTerminalConnection>;
  disconnectTerminal(
    workspace: WorkspaceRecord,
    connectionId: string,
    input?: ResolveWorkspaceTerminalRuntimeInput,
  ): Promise<void>;
  startStack(
    workspace: WorkspaceRecord,
    config: LifecycleConfig,
    input: StartStackInput,
  ): Promise<StartStackResult>;
  stopStack(workspace: WorkspaceRecord, input: StopWorkspaceStackInput): Promise<void>;
  readManifest(dirPath: string): Promise<ManifestStatus>;
  getGitCurrentBranch(repoPath: string): Promise<string>;
  ensureWorkspace(input: EnsureWorkspaceInput): Promise<WorkspaceRecord>;
  renameWorkspace(input: RenameWorkspaceInput): Promise<WorkspaceRecord>;
  inspectArchive(workspace: WorkspaceRecord): Promise<WorkspaceArchiveDisposition>;
  archiveWorkspace(input: ArchiveWorkspaceInput): Promise<void>;
  readFile(workspace: WorkspaceRecord, filePath: string): Promise<WorkspaceFileReadResult>;
  writeFile(
    workspace: WorkspaceRecord,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult>;
  subscribeFileEvents(
    input: SubscribeWorkspaceFileEventsInput,
    listener: WorkspaceFileEventListener,
  ): Promise<WorkspaceFileEventSubscription>;
  listFiles(workspace: WorkspaceRecord): Promise<WorkspaceFileTreeEntry[]>;
  openFile(workspace: WorkspaceRecord, filePath: string): Promise<void>;
  openInApp(workspace: WorkspaceRecord, appId: OpenInAppId): Promise<void>;
  listOpenInApps(): Promise<WorkspaceOpenInAppInfo[]>;
  getGitStatus(workspace: WorkspaceRecord): Promise<GitStatusResult>;
  getGitScopePatch(workspace: WorkspaceRecord, scope: GitDiffScope): Promise<string>;
  getGitChangesPatch(workspace: WorkspaceRecord): Promise<string>;
  getGitDiff(input: GitDiffInput): Promise<GitDiffResult>;
  listGitLog(workspace: WorkspaceRecord, limit: number): Promise<GitLogEntry[]>;
  listGitPullRequests(workspace: WorkspaceRecord): Promise<GitPullRequestListResult>;
  getGitPullRequest(
    workspace: WorkspaceRecord,
    pullRequestNumber: number,
  ): Promise<GitPullRequestDetailResult>;
  getCurrentGitPullRequest(workspace: WorkspaceRecord): Promise<GitBranchPullRequestResult>;
  getGitBaseRef(workspace: WorkspaceRecord): Promise<string | null>;
  getGitRefDiffPatch(workspace: WorkspaceRecord, baseRef: string, headRef: string): Promise<string>;
  getGitPullRequestPatch(workspace: WorkspaceRecord, pullRequestNumber: number): Promise<string>;
  getGitCommitPatch(workspace: WorkspaceRecord, sha: string): Promise<GitCommitDiffResult>;
  stageGitFiles(workspace: WorkspaceRecord, filePaths: string[]): Promise<void>;
  unstageGitFiles(workspace: WorkspaceRecord, filePaths: string[]): Promise<void>;
  commitGit(workspace: WorkspaceRecord, message: string): Promise<GitCommitResult>;
  pushGit(workspace: WorkspaceRecord): Promise<GitPushResult>;
  createGitPullRequest(workspace: WorkspaceRecord): Promise<GitPullRequestSummary>;
  mergeGitPullRequest(
    workspace: WorkspaceRecord,
    pullRequestNumber: number,
  ): Promise<GitPullRequestSummary>;
}
