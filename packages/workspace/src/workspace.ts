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
  worktreePath?: string | null;
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

export interface WorkspaceClient {
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
