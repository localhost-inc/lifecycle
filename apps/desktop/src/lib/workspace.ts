import type { WorkspaceRecord, TerminalRecord } from "@lifecycle/contracts";
import {
  type StartServicesInput,
  HostWorkspaceClient,
  type CreateTerminalInput,
  type GitDiffInput,
  type WorkspaceClient,
  type SavedTerminalAttachment,
  type SaveTerminalAttachmentInput,
  type ServiceLogSnapshot,
  type WorkspaceFileReadResult,
  type WorkspaceFileTreeEntry,
  type WorkspaceHealthResult,
} from "@lifecycle/workspace";
import { getBackend } from "@/lib/backend";
import { invokeTauri } from "@/lib/tauri-error";

let workspaceClientRouter: WorkspaceClient | null = null;
let hostWorkspaceClient: WorkspaceClient | null = null;

export function getWorkspaceClient(): WorkspaceClient {
  workspaceClientRouter ??= createWorkspaceClientRouter({
    backend: getBackend(),
    hostWorkspaceClient: getHostWorkspaceClient(),
  });
  return workspaceClientRouter;
}

export function resetWorkspaceClientForTests(): void {
  workspaceClientRouter = null;
  hostWorkspaceClient = null;
}

function getHostWorkspaceClient(): WorkspaceClient {
  hostWorkspaceClient ??= new HostWorkspaceClient((command, args) => invokeTauri(command, args));
  return hostWorkspaceClient;
}

export function createWorkspaceClientRouter(dependencies: {
  backend: Pick<ReturnType<typeof getBackend>, "getWorkspace">;
  hostWorkspaceClient: WorkspaceClient;
}): WorkspaceClient {
  return new WorkspaceClientRouter(dependencies.backend, dependencies.hostWorkspaceClient);
}

class WorkspaceClientRouter implements WorkspaceClient {
  private readonly targetCache = new Map<string, WorkspaceRecord["target"]>();

  constructor(
    private readonly backend: Pick<ReturnType<typeof getBackend>, "getWorkspace">,
    private readonly hostWorkspaceClient: WorkspaceClient,
  ) {}

  private resolveWorkspaceClientForRecord(
    workspace: Pick<WorkspaceRecord, "id" | "target">,
  ): WorkspaceClient {
    if (workspace.target === "host") {
      return this.hostWorkspaceClient;
    }

    throw new Error(
      `Workspace ${workspace.id} uses unsupported target '${workspace.target}'.`,
    );
  }

  private async resolveWorkspaceClientForId(workspaceId: string): Promise<WorkspaceClient> {
    const cachedTarget = this.targetCache.get(workspaceId);
    if (cachedTarget) {
      return this.resolveWorkspaceClientForRecord({ id: workspaceId, target: cachedTarget });
    }
    const workspace = await this.backend.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} was not found.`);
    }
    this.targetCache.set(workspaceId, workspace.target);
    return this.resolveWorkspaceClientForRecord(workspace);
  }

  private async withWorkspaceClient<T>(
    workspaceId: string,
    run: (client: WorkspaceClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.resolveWorkspaceClientForId(workspaceId);
    return run(client);
  }

  private withResolvedWorkspaceClient<T>(
    workspace: Pick<WorkspaceRecord, "id" | "target">,
    run: (client: WorkspaceClient) => Promise<T>,
  ): Promise<T> {
    return run(this.resolveWorkspaceClientForRecord(workspace));
  }

  startServices(input: StartServicesInput) {
    return this.withResolvedWorkspaceClient(input.workspace, (client) =>
      client.startServices(input),
    );
  }

  healthCheck(workspaceId: string): Promise<WorkspaceHealthResult> {
    return this.withWorkspaceClient(workspaceId, (client) => client.healthCheck(workspaceId));
  }

  stopServices(workspaceId: string): Promise<void> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.stopServices(workspaceId),
    );
  }

  getActivity(workspaceId: string) {
    return this.withWorkspaceClient(workspaceId, (client) => client.getActivity(workspaceId));
  }

  getServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]> {
    return this.withWorkspaceClient(workspaceId, (client) => client.getServiceLogs(workspaceId));
  }

  getServices(workspaceId: string) {
    return this.withWorkspaceClient(workspaceId, (client) => client.getServices(workspaceId));
  }

  createTerminal(input: CreateTerminalInput) {
    return this.withWorkspaceClient(input.workspaceId, (client) => client.createTerminal(input));
  }

  async listTerminals(workspaceId: string): Promise<TerminalRecord[]> {
    return this.withWorkspaceClient(workspaceId, (client) => client.listTerminals(workspaceId));
  }

  renameTerminal(workspaceId: string, terminalId: string, label: string) {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.renameTerminal(workspaceId, terminalId, label),
    );
  }

  saveTerminalAttachment(input: SaveTerminalAttachmentInput): Promise<SavedTerminalAttachment> {
    return this.withWorkspaceClient(input.workspaceId, (client) =>
      client.saveTerminalAttachment(input),
    );
  }

  detachTerminal(workspaceId: string, terminalId: string): Promise<void> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.detachTerminal(workspaceId, terminalId),
    );
  }

  killTerminal(workspaceId: string, terminalId: string): Promise<void> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.killTerminal(workspaceId, terminalId),
    );
  }

  interruptTerminal(workspaceId: string, terminalId: string): Promise<void> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.interruptTerminal(workspaceId, terminalId),
    );
  }

  readFile(workspaceId: string, filePath: string): Promise<WorkspaceFileReadResult> {
    return this.withWorkspaceClient(workspaceId, (client) => client.readFile(workspaceId, filePath));
  }

  writeFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.writeFile(workspaceId, filePath, content),
    );
  }

  listFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]> {
    return this.withWorkspaceClient(workspaceId, (client) => client.listFiles(workspaceId));
  }

  openFile(workspaceId: string, filePath: string): Promise<void> {
    return this.withWorkspaceClient(workspaceId, (client) => client.openFile(workspaceId, filePath));
  }

  getGitStatus(workspaceId: string) {
    return this.withWorkspaceClient(workspaceId, (client) => client.getGitStatus(workspaceId));
  }

  getGitScopePatch(workspaceId: string, scope: GitDiffInput["scope"]): Promise<string> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.getGitScopePatch(workspaceId, scope),
    );
  }

  getGitChangesPatch(workspaceId: string): Promise<string> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.getGitChangesPatch(workspaceId),
    );
  }

  getGitDiff(input: GitDiffInput) {
    return this.withWorkspaceClient(input.workspaceId, (client) => client.getGitDiff(input));
  }

  listGitLog(workspaceId: string, limit: number) {
    return this.withWorkspaceClient(workspaceId, (client) => client.listGitLog(workspaceId, limit));
  }

  listGitPullRequests(workspaceId: string) {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.listGitPullRequests(workspaceId),
    );
  }

  getGitPullRequest(workspaceId: string, pullRequestNumber: number) {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.getGitPullRequest(workspaceId, pullRequestNumber),
    );
  }

  getCurrentGitPullRequest(workspaceId: string) {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.getCurrentGitPullRequest(workspaceId),
    );
  }

  getGitBaseRef(workspaceId: string) {
    return this.withWorkspaceClient(workspaceId, (client) => client.getGitBaseRef(workspaceId));
  }

  getGitRefDiffPatch(workspaceId: string, baseRef: string, headRef: string): Promise<string> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.getGitRefDiffPatch(workspaceId, baseRef, headRef),
    );
  }

  getGitPullRequestPatch(workspaceId: string, pullRequestNumber: number): Promise<string> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.getGitPullRequestPatch(workspaceId, pullRequestNumber),
    );
  }

  getGitCommitPatch(workspaceId: string, sha: string) {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.getGitCommitPatch(workspaceId, sha),
    );
  }

  stageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.stageGitFiles(workspaceId, filePaths),
    );
  }

  unstageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.unstageGitFiles(workspaceId, filePaths),
    );
  }

  commitGit(workspaceId: string, message: string) {
    return this.withWorkspaceClient(workspaceId, (client) => client.commitGit(workspaceId, message));
  }

  pushGit(workspaceId: string) {
    return this.withWorkspaceClient(workspaceId, (client) => client.pushGit(workspaceId));
  }

  createGitPullRequest(workspaceId: string) {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.createGitPullRequest(workspaceId),
    );
  }

  mergeGitPullRequest(workspaceId: string, pullRequestNumber: number) {
    return this.withWorkspaceClient(workspaceId, (client) =>
      client.mergeGitPullRequest(workspaceId, pullRequestNumber),
    );
  }
}
