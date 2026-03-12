import type {
  GitBranchPullRequestResult,
  GitCommitResult,
  GitDiffResult,
  GitLogEntry,
  GitPullRequestListResult,
  GitPullRequestSummary,
  GitPushResult,
  GitStatusResult,
  ServiceRecord,
  TerminalRecord,
} from "@lifecycle/contracts";
import type {
  WorkspaceProvider,
  WorkspaceProviderCreateTerminalInput,
  WorkspaceProviderCreateInput,
  WorkspaceProviderCreateResult,
  WorkspaceProviderGitDiffInput,
  WorkspaceProviderHealthResult,
  WorkspaceProviderStartInput,
  WorkspaceProviderWakeInput,
} from "../../provider";

export interface CloudWorkspaceClient {
  createWorkspace(input: WorkspaceProviderCreateInput): Promise<WorkspaceProviderCreateResult>;
  startServices(input: WorkspaceProviderStartInput): Promise<ServiceRecord[]>;
  healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult>;
  stopServices(workspaceId: string, serviceNames?: string[]): Promise<void>;
  runSetup(workspaceId: string): Promise<void>;
  sleep(workspaceId: string): Promise<void>;
  wake(input: WorkspaceProviderWakeInput): Promise<void>;
  destroy(workspaceId: string): Promise<void>;
  createTerminal(input: WorkspaceProviderCreateTerminalInput): Promise<TerminalRecord>;
  detachTerminal(terminalId: string): Promise<void>;
  killTerminal(terminalId: string): Promise<void>;
  exposePort(workspaceId: string, serviceName: string, port: number): Promise<string | null>;
  getGitStatus(workspaceId: string): Promise<GitStatusResult>;
  getGitChangesPatch(workspaceId: string): Promise<string>;
  getGitDiff(input: WorkspaceProviderGitDiffInput): Promise<GitDiffResult>;
  listGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]>;
  listGitPullRequests(workspaceId: string): Promise<GitPullRequestListResult>;
  getCurrentGitPullRequest(workspaceId: string): Promise<GitBranchPullRequestResult>;
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

  createTerminal(
    input: WorkspaceProviderCreateTerminalInput,
  ): Promise<TerminalRecord> {
    return this.client.createTerminal(input);
  }

  detachTerminal(terminalId: string): Promise<void> {
    return this.client.detachTerminal(terminalId);
  }

  killTerminal(terminalId: string): Promise<void> {
    return this.client.killTerminal(terminalId);
  }

  exposePort(workspaceId: string, serviceName: string, port: number): Promise<string | null> {
    return this.client.exposePort(workspaceId, serviceName, port);
  }

  getGitStatus(workspaceId: string): Promise<GitStatusResult> {
    return this.client.getGitStatus(workspaceId);
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

  getCurrentGitPullRequest(workspaceId: string): Promise<GitBranchPullRequestResult> {
    return this.client.getCurrentGitPullRequest(workspaceId);
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
