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
  ServiceRecord,
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type {
  WorkspaceProviderFileReadResult,
  WorkspaceProviderFileTreeEntry,
  WorkspaceProvider,
  WorkspaceProviderCreateTerminalInput,
  WorkspaceProviderCreateInput,
  WorkspaceProviderCreateResult,
  WorkspaceProviderGitDiffInput,
  WorkspaceProviderHealthResult,
  WorkspaceProviderRuntimeProjectionResult,
  WorkspaceProviderSaveTerminalAttachmentInput,
  WorkspaceProviderSavedTerminalAttachment,
  WorkspaceProviderSnapshotResult,
  WorkspaceProviderStartInput,
  WorkspaceProviderSyncManifestInput,
  WorkspaceProviderUpdateServiceInput,
  WorkspaceProviderWakeInput,
} from "../../provider";

export interface CloudWorkspaceClient {
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

export class CloudWorkspaceProvider implements WorkspaceProvider {
  private client: CloudWorkspaceClient;

  constructor(client: CloudWorkspaceClient) {
    this.client = client;
  }

  createWorkspace(input: WorkspaceProviderCreateInput): Promise<WorkspaceProviderCreateResult> {
    return this.client.createWorkspace(input);
  }

  renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord> {
    return this.client.renameWorkspace(workspaceId, name);
  }

  startServices(input: WorkspaceProviderStartInput): Promise<ServiceRecord[]> {
    return this.client.startServices(input);
  }

  healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult> {
    return this.client.healthCheck(workspaceId);
  }

  stopServices(workspaceId: string, serviceNames?: string[]): Promise<void> {
    return this.client.stopServices(workspaceId, serviceNames);
  }

  runSetup(workspaceId: string): Promise<void> {
    return this.client.runSetup(workspaceId);
  }

  sleep(workspaceId: string): Promise<void> {
    return this.client.sleep(workspaceId);
  }

  wake(input: WorkspaceProviderWakeInput): Promise<void> {
    return this.client.wake(input);
  }

  destroy(workspaceId: string): Promise<void> {
    return this.client.destroy(workspaceId);
  }

  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    return this.client.getWorkspace(workspaceId);
  }

  getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]> {
    return this.client.getWorkspaceServices(workspaceId);
  }

  getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceProviderSnapshotResult> {
    return this.client.getWorkspaceSnapshot(workspaceId);
  }

  getWorkspaceRuntimeProjection(
    workspaceId: string,
  ): Promise<WorkspaceProviderRuntimeProjectionResult> {
    return this.client.getWorkspaceRuntimeProjection(workspaceId);
  }

  updateWorkspaceService(input: WorkspaceProviderUpdateServiceInput): Promise<void> {
    return this.client.updateWorkspaceService(input);
  }

  syncWorkspaceManifest(input: WorkspaceProviderSyncManifestInput): Promise<void> {
    return this.client.syncWorkspaceManifest(input);
  }

  createTerminal(input: WorkspaceProviderCreateTerminalInput): Promise<TerminalRecord> {
    return this.client.createTerminal(input);
  }

  listWorkspaceTerminals(workspaceId: string): Promise<TerminalRecord[]> {
    return this.client.listWorkspaceTerminals(workspaceId);
  }

  getTerminal(terminalId: string): Promise<TerminalRecord | null> {
    return this.client.getTerminal(terminalId);
  }

  renameTerminal(terminalId: string, label: string): Promise<TerminalRecord> {
    return this.client.renameTerminal(terminalId, label);
  }

  saveTerminalAttachment(
    input: WorkspaceProviderSaveTerminalAttachmentInput,
  ): Promise<WorkspaceProviderSavedTerminalAttachment> {
    return this.client.saveTerminalAttachment(input);
  }

  detachTerminal(terminalId: string): Promise<void> {
    return this.client.detachTerminal(terminalId);
  }

  killTerminal(terminalId: string): Promise<void> {
    return this.client.killTerminal(terminalId);
  }

  readWorkspaceFile(
    workspaceId: string,
    filePath: string,
  ): Promise<WorkspaceProviderFileReadResult> {
    return this.client.readWorkspaceFile(workspaceId, filePath);
  }

  writeWorkspaceFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceProviderFileReadResult> {
    return this.client.writeWorkspaceFile(workspaceId, filePath, content);
  }

  listWorkspaceFiles(workspaceId: string): Promise<WorkspaceProviderFileTreeEntry[]> {
    return this.client.listWorkspaceFiles(workspaceId);
  }

  openWorkspaceFile(workspaceId: string, filePath: string): Promise<void> {
    return this.client.openWorkspaceFile(workspaceId, filePath);
  }

  exposePort(workspaceId: string, serviceName: string, port: number): Promise<string | null> {
    return this.client.exposePort(workspaceId, serviceName, port);
  }

  getGitStatus(workspaceId: string): Promise<GitStatusResult> {
    return this.client.getGitStatus(workspaceId);
  }

  getGitScopePatch(workspaceId: string, scope: GitDiffScope): Promise<string> {
    return this.client.getGitScopePatch(workspaceId, scope);
  }

  getGitChangesPatch(workspaceId: string): Promise<string> {
    return this.client.getGitChangesPatch(workspaceId);
  }

  getGitDiff(input: WorkspaceProviderGitDiffInput): Promise<GitDiffResult> {
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
