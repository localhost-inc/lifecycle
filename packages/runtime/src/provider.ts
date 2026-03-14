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
  LifecycleEvent,
  ServiceRecord,
  TerminalRecord,
  WorkspaceKind,
  WorkspaceRecord,
  WorkspaceServiceExposure,
} from "@lifecycle/contracts";

export interface LocalWorkspaceProviderCreateContext {
  mode: "local";
  kind?: WorkspaceKind;
  projectId: string;
  projectPath: string;
  workspaceName?: string;
  baseRef?: string;
  worktreeRoot?: string;
}

export interface CloudWorkspaceProviderCreateContext {
  mode: "cloud";
  organizationId: string;
  repositoryId: string;
  projectId: string;
}

export type WorkspaceProviderCreateContext =
  | LocalWorkspaceProviderCreateContext
  | CloudWorkspaceProviderCreateContext;

export interface WorkspaceProviderCreateInput {
  workspaceId: string;
  sourceRef: string;
  manifestPath: string;
  manifestJson?: string | null;
  manifestFingerprint?: string | null;
  resolvedSecrets: Record<string, string>;
  context: WorkspaceProviderCreateContext;
}

export interface WorkspaceProviderCreateResult {
  workspace: WorkspaceRecord;
  worktreePath: string;
}

export interface WorkspaceProviderStartInput {
  workspace: WorkspaceRecord;
  services: ServiceRecord[];
  manifestJson: string;
  manifestFingerprint: string;
}

export type WorkspaceProviderWakeInput = WorkspaceProviderStartInput;

export interface WorkspaceProviderHealthResult {
  healthy: boolean;
  services: ServiceRecord[];
}

export interface WorkspaceProviderCreateTerminalInput {
  workspaceId: string;
  launchType: "shell" | "harness";
  harnessProvider?: string | null;
  harnessSessionId?: string | null;
}

export interface WorkspaceProviderSaveTerminalAttachmentInput {
  base64Data: string;
  fileName: string;
  mediaType?: string | null;
  workspaceId: string;
}

export interface WorkspaceProviderGitDiffInput {
  workspaceId: string;
  filePath: string;
  scope: GitDiffScope;
}

export interface WorkspaceProviderUpdateServiceInput {
  workspaceId: string;
  serviceName: string;
  exposure: WorkspaceServiceExposure;
  portOverride: number | null;
}

export interface WorkspaceProviderSyncManifestInput {
  workspaceId: string;
  manifestJson: string | null;
  manifestFingerprint: string | null;
}

export type WorkspaceProviderProgressStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "timeout";

export interface WorkspaceProviderStepProgressSnapshot {
  name: string;
  output: string[];
  status: WorkspaceProviderProgressStatus;
}

export interface WorkspaceProviderRuntimeProjectionResult {
  activity: LifecycleEvent[];
  environmentTasks: WorkspaceProviderStepProgressSnapshot[];
  setup: WorkspaceProviderStepProgressSnapshot[];
}

export interface WorkspaceProviderSnapshotResult {
  services: ServiceRecord[];
  terminals: TerminalRecord[];
  workspace: WorkspaceRecord | null;
}

export interface WorkspaceProviderFileReadResult {
  absolute_path: string;
  byte_len: number;
  content: string | null;
  extension: string | null;
  file_path: string;
  is_binary: boolean;
  is_too_large: boolean;
}

export interface WorkspaceProviderFileTreeEntry {
  extension: string | null;
  file_path: string;
}

export interface WorkspaceProviderSavedTerminalAttachment {
  absolutePath: string;
  fileName: string;
  relativePath: string;
}

export interface WorkspaceProvider {
  createWorkspace(input: WorkspaceProviderCreateInput): Promise<WorkspaceProviderCreateResult>;
  renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord>;
  startServices(input: WorkspaceProviderStartInput): Promise<ServiceRecord[]>;
  healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult>;
  stopServices(workspaceId: string, serviceNames?: string[]): Promise<void>;
  runSetup(workspaceId: string): Promise<void>;
  sleep(workspaceId: string): Promise<void>;
  wake(input: WorkspaceProviderWakeInput): Promise<void>;
  destroy(workspaceId: string): Promise<void>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]>;
  getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceProviderSnapshotResult>;
  getWorkspaceRuntimeProjection(
    workspaceId: string,
  ): Promise<WorkspaceProviderRuntimeProjectionResult>;
  updateWorkspaceService(input: WorkspaceProviderUpdateServiceInput): Promise<void>;
  syncWorkspaceManifest(input: WorkspaceProviderSyncManifestInput): Promise<void>;
  createTerminal(input: WorkspaceProviderCreateTerminalInput): Promise<TerminalRecord>;
  listWorkspaceTerminals(workspaceId: string): Promise<TerminalRecord[]>;
  getTerminal(terminalId: string): Promise<TerminalRecord | null>;
  renameTerminal(terminalId: string, label: string): Promise<TerminalRecord>;
  saveTerminalAttachment(
    input: WorkspaceProviderSaveTerminalAttachmentInput,
  ): Promise<WorkspaceProviderSavedTerminalAttachment>;
  detachTerminal(terminalId: string): Promise<void>;
  killTerminal(terminalId: string): Promise<void>;
  readWorkspaceFile(
    workspaceId: string,
    filePath: string,
  ): Promise<WorkspaceProviderFileReadResult>;
  writeWorkspaceFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceProviderFileReadResult>;
  listWorkspaceFiles(workspaceId: string): Promise<WorkspaceProviderFileTreeEntry[]>;
  openWorkspaceFile(workspaceId: string, filePath: string): Promise<void>;
  exposePort(workspaceId: string, serviceName: string, port: number): Promise<string | null>;
  getGitStatus(workspaceId: string): Promise<GitStatusResult>;
  getGitScopePatch(workspaceId: string, scope: GitDiffScope): Promise<string>;
  getGitChangesPatch(workspaceId: string): Promise<string>;
  getGitDiff(input: WorkspaceProviderGitDiffInput): Promise<GitDiffResult>;
  listGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]>;
  listGitPullRequests(workspaceId: string): Promise<GitPullRequestListResult>;
  getGitPullRequest(
    workspaceId: string,
    pullRequestNumber: number,
  ): Promise<GitPullRequestDetailResult>;
  getCurrentGitPullRequest(workspaceId: string): Promise<GitBranchPullRequestResult>;
  getGitBaseRef(workspaceId: string): Promise<string | null>;
  getGitRefDiffPatch(workspaceId: string, baseRef: string, headRef: string): Promise<string>;
  getGitPullRequestPatch(workspaceId: string, pullRequestNumber: number): Promise<string>;
  getGitCommitPatch(workspaceId: string, sha: string): Promise<GitCommitDiffResult>;
  stageGitFiles(workspaceId: string, filePaths: string[]): Promise<void>;
  unstageGitFiles(workspaceId: string, filePaths: string[]): Promise<void>;
  commitGit(workspaceId: string, message: string): Promise<GitCommitResult>;
  pushGit(workspaceId: string): Promise<GitPushResult>;
  createGitPullRequest(workspaceId: string): Promise<GitPullRequestSummary>;
  mergeGitPullRequest(
    workspaceId: string,
    pullRequestNumber: number,
  ): Promise<GitPullRequestSummary>;
}
