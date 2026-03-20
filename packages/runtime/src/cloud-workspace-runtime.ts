import type {
  EnvironmentRecord,
  GitBranchPullRequestResult,
  GitCommitDiffResult,
  GitCommitResult,
  GitDiffResult,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitPullRequestSummary,
  GitPushResult,
  GitStatusResult,
  LifecycleEvent,
  ServiceRecord,
  TerminalRecord,
} from "@lifecycle/contracts";
import type {
  CreateTerminalInput,
  GitDiffInput,
  SavedTerminalAttachment,
  ServiceLogSnapshot,
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceHealthResult,
  WorkspaceRuntime,
  WorkspaceStartInput,
  WorkspaceWakeInput,
  SaveTerminalAttachmentInput,
} from "./workspace-runtime";

export interface CloudWorkspaceRuntimeClient {
  startServices(input: WorkspaceStartInput): Promise<ServiceRecord[]>;
  healthCheck(workspaceId: string): Promise<WorkspaceHealthResult>;
  stopServices(workspaceId: string, serviceNames?: string[]): Promise<void>;
  sleep(workspaceId: string): Promise<void>;
  wake(input: WorkspaceWakeInput): Promise<void>;
  getEnvironment(workspaceId: string): Promise<EnvironmentRecord>;
  getActivity(workspaceId: string): Promise<LifecycleEvent[]>;
  getServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]>;
  getServices(workspaceId: string): Promise<ServiceRecord[]>;
  createTerminal(input: CreateTerminalInput): Promise<TerminalRecord>;
  listTerminals(workspaceId: string): Promise<TerminalRecord[]>;
  getTerminal(terminalId: string): Promise<TerminalRecord | null>;
  renameTerminal(terminalId: string, label: string): Promise<TerminalRecord>;
  saveTerminalAttachment(input: SaveTerminalAttachmentInput): Promise<SavedTerminalAttachment>;
  detachTerminal(terminalId: string): Promise<void>;
  killTerminal(terminalId: string): Promise<void>;
  interruptTerminal(terminalId: string): Promise<void>;
  readFile(workspaceId: string, filePath: string): Promise<WorkspaceFileReadResult>;
  writeFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult>;
  listFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]>;
  openFile(workspaceId: string, filePath: string): Promise<void>;
  getGitStatus(workspaceId: string): Promise<GitStatusResult>;
  getGitScopePatch(workspaceId: string, scope: GitDiffInput["scope"]): Promise<string>;
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
}

export class CloudWorkspaceRuntime implements WorkspaceRuntime {
  private client: CloudWorkspaceRuntimeClient;

  constructor(client: CloudWorkspaceRuntimeClient) {
    this.client = client;
  }

  startServices(input: WorkspaceStartInput): Promise<ServiceRecord[]> {
    return this.client.startServices(input);
  }

  healthCheck(workspaceId: string): Promise<WorkspaceHealthResult> {
    return this.client.healthCheck(workspaceId);
  }

  stopServices(workspaceId: string, serviceNames?: string[]): Promise<void> {
    return this.client.stopServices(workspaceId, serviceNames);
  }

  sleep(workspaceId: string): Promise<void> {
    return this.client.sleep(workspaceId);
  }

  wake(input: WorkspaceWakeInput): Promise<void> {
    return this.client.wake(input);
  }

  getEnvironment(workspaceId: string): Promise<EnvironmentRecord> {
    return this.client.getEnvironment(workspaceId);
  }

  getActivity(workspaceId: string): Promise<LifecycleEvent[]> {
    return this.client.getActivity(workspaceId);
  }

  getServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]> {
    return this.client.getServiceLogs(workspaceId);
  }

  getServices(workspaceId: string): Promise<ServiceRecord[]> {
    return this.client.getServices(workspaceId);
  }

  createTerminal(input: CreateTerminalInput): Promise<TerminalRecord> {
    return this.client.createTerminal(input);
  }

  listTerminals(workspaceId: string): Promise<TerminalRecord[]> {
    return this.client.listTerminals(workspaceId);
  }

  getTerminal(terminalId: string): Promise<TerminalRecord | null> {
    return this.client.getTerminal(terminalId);
  }

  renameTerminal(terminalId: string, label: string): Promise<TerminalRecord> {
    return this.client.renameTerminal(terminalId, label);
  }

  saveTerminalAttachment(input: SaveTerminalAttachmentInput): Promise<SavedTerminalAttachment> {
    return this.client.saveTerminalAttachment(input);
  }

  detachTerminal(terminalId: string): Promise<void> {
    return this.client.detachTerminal(terminalId);
  }

  killTerminal(terminalId: string): Promise<void> {
    return this.client.killTerminal(terminalId);
  }

  interruptTerminal(terminalId: string): Promise<void> {
    return this.client.interruptTerminal(terminalId);
  }

  readFile(workspaceId: string, filePath: string): Promise<WorkspaceFileReadResult> {
    return this.client.readFile(workspaceId, filePath);
  }

  writeFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult> {
    return this.client.writeFile(workspaceId, filePath, content);
  }

  listFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]> {
    return this.client.listFiles(workspaceId);
  }

  openFile(workspaceId: string, filePath: string): Promise<void> {
    return this.client.openFile(workspaceId, filePath);
  }

  getGitStatus(workspaceId: string): Promise<GitStatusResult> {
    return this.client.getGitStatus(workspaceId);
  }

  getGitScopePatch(workspaceId: string, scope: GitDiffInput["scope"]): Promise<string> {
    return this.client.getGitScopePatch(workspaceId, scope);
  }

  getGitChangesPatch(workspaceId: string): Promise<string> {
    return this.client.getGitChangesPatch(workspaceId);
  }

  getGitDiff(input: GitDiffInput): Promise<GitDiffResult> {
    return this.client.getGitDiff(input);
  }

  listGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]> {
    return this.client.listGitLog(workspaceId, limit);
  }

  listGitPullRequests(workspaceId: string): Promise<GitPullRequestListResult> {
    return this.client.listGitPullRequests(workspaceId);
  }

  getGitPullRequest(
    workspaceId: string,
    pullRequestNumber: number,
  ): Promise<GitPullRequestDetailResult> {
    return this.client.getGitPullRequest(workspaceId, pullRequestNumber);
  }

  getCurrentGitPullRequest(workspaceId: string): Promise<GitBranchPullRequestResult> {
    return this.client.getCurrentGitPullRequest(workspaceId);
  }

  getGitBaseRef(workspaceId: string): Promise<string | null> {
    return this.client.getGitBaseRef(workspaceId);
  }

  getGitRefDiffPatch(workspaceId: string, baseRef: string, headRef: string): Promise<string> {
    return this.client.getGitRefDiffPatch(workspaceId, baseRef, headRef);
  }

  getGitPullRequestPatch(workspaceId: string, pullRequestNumber: number): Promise<string> {
    return this.client.getGitPullRequestPatch(workspaceId, pullRequestNumber);
  }

  getGitCommitPatch(workspaceId: string, sha: string): Promise<GitCommitDiffResult> {
    return this.client.getGitCommitPatch(workspaceId, sha);
  }

  stageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
    return this.client.stageGitFiles(workspaceId, filePaths);
  }

  unstageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
    return this.client.unstageGitFiles(workspaceId, filePaths);
  }

  commitGit(workspaceId: string, message: string): Promise<GitCommitResult> {
    return this.client.commitGit(workspaceId, message);
  }

  pushGit(workspaceId: string): Promise<GitPushResult> {
    return this.client.pushGit(workspaceId);
  }

  createGitPullRequest(workspaceId: string): Promise<GitPullRequestSummary> {
    return this.client.createGitPullRequest(workspaceId);
  }

  mergeGitPullRequest(
    workspaceId: string,
    pullRequestNumber: number,
  ): Promise<GitPullRequestSummary> {
    return this.client.mergeGitPullRequest(workspaceId, pullRequestNumber);
  }
}
