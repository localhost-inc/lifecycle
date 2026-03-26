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
  WorkspaceCheckoutType,
  WorkspaceRecord,
  WorkspaceHost,
} from "@lifecycle/contracts";

export interface StartServicesInput {
  serviceNames?: string[];
  workspace: WorkspaceRecord;
  services: ServiceRecord[];
  manifestJson: string;
  manifestFingerprint: string;
}

export interface WorkspaceHealthResult {
  healthy: boolean;
  services: ServiceRecord[];
}

export interface GitDiffInput {
  workspaceId: string;
  filePath: string;
  scope: GitDiffScope;
}

export interface ServiceLogLine {
  stream: "stdout" | "stderr";
  text: string;
}

export interface ServiceLogSnapshot {
  name: string;
  lines: ServiceLogLine[];
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
  worktreePath?: string | null;
}

export interface WorkspaceClient {
  startServices(input: StartServicesInput): Promise<ServiceRecord[]>;
  healthCheck(workspaceId: string): Promise<WorkspaceHealthResult>;
  stopServices(workspaceId: string): Promise<void>;
  getActivity(workspaceId: string): Promise<LifecycleEvent[]>;
  getServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]>;
  getServices(workspaceId: string): Promise<ServiceRecord[]>;
  readFile(workspaceId: string, filePath: string): Promise<WorkspaceFileReadResult>;
  writeFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult>;
  subscribeFileEvents(
    input: SubscribeWorkspaceFileEventsInput,
    listener: WorkspaceFileEventListener,
  ): Promise<WorkspaceFileEventSubscription>;
  listFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]>;
  openFile(workspaceId: string, filePath: string): Promise<void>;
  getGitStatus(workspaceId: string): Promise<GitStatusResult>;
  getGitScopePatch(workspaceId: string, scope: GitDiffScope): Promise<string>;
  getGitChangesPatch(workspaceId: string): Promise<string>;
  getGitDiff(input: GitDiffInput): Promise<GitDiffResult>;
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

  // Workspace lifecycle
  createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult>;
  renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord>;
  archiveWorkspace(workspaceId: string): Promise<void>;
  readManifestText(dirPath: string): Promise<string | null>;
  getCurrentBranch(projectPath: string): Promise<string>;
  cleanupProject(projectId: string): Promise<void>;
}

export interface WorkspaceCreateContext {
  host: WorkspaceHost;
  checkoutType?: WorkspaceCheckoutType;
  projectId: string;
  projectPath?: string;
  workspaceName?: string;
  baseRef?: string;
  worktreeRoot?: string;
}

export interface WorkspaceCreateInput {
  manifestJson?: string | null;
  manifestFingerprint?: string | null;
  context: WorkspaceCreateContext;
}

export interface WorkspaceCreateResult {
  workspace: WorkspaceRecord;
  worktreePath: string;
}
