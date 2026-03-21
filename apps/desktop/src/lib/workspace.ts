import { isTauri } from "@tauri-apps/api/core";
import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
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
  type SubscribeWorkspaceFileEventsInput,
  type WorkspaceFileEventListener,
  type WorkspaceFileEventSubscription,
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

async function subscribeHostWorkspaceFileEvents(
  input: SubscribeWorkspaceFileEventsInput,
  listener: WorkspaceFileEventListener,
): Promise<WorkspaceFileEventSubscription> {
  if (!isTauri() || !input.worktreePath) {
    return () => {};
  }

  let disposed = false;
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let unwatch: UnwatchFn | undefined;

  const emitChanged = () => {
    if (refreshTimeout !== null) {
      clearTimeout(refreshTimeout);
    }

    refreshTimeout = setTimeout(() => {
      refreshTimeout = null;
      listener({
        kind: "changed",
        workspaceId: input.workspaceId,
      });
    }, 100);
  };

  try {
    unwatch = await watch(
      input.worktreePath,
      () => {
        if (!disposed) {
          emitChanged();
        }
      },
      { delayMs: 150, recursive: true },
    );
  } catch (error) {
    console.error("Failed to watch workspace file tree:", input.worktreePath, error);
  }

  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      emitChanged();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return () => {
    disposed = true;
    if (refreshTimeout !== null) {
      clearTimeout(refreshTimeout);
    }
    unwatch?.();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };
}

function getHostWorkspaceClient(): WorkspaceClient {
  hostWorkspaceClient ??= new HostWorkspaceClient(
    (command, args) => invokeTauri(command, args),
    subscribeHostWorkspaceFileEvents,
  );
  return hostWorkspaceClient;
}

export function createWorkspaceClientRouter(dependencies: {
  backend: Pick<ReturnType<typeof getBackend>, "getWorkspace">;
  hostWorkspaceClient: WorkspaceClient;
}): WorkspaceClient {
  return new WorkspaceClientRouter(dependencies.backend, dependencies.hostWorkspaceClient);
}

class WorkspaceClientRouter implements WorkspaceClient {
  private readonly workspaceFactsCache = new Map<
    string,
    Pick<WorkspaceRecord, "target" | "worktree_path">
  >();

  constructor(
    private readonly backend: Pick<ReturnType<typeof getBackend>, "getWorkspace">,
    private readonly hostWorkspaceClient: WorkspaceClient,
  ) {}

  private resolveWorkspaceClientForRecord(
    workspace: Pick<WorkspaceRecord, "id" | "target">,
  ): WorkspaceClient {
    if (workspace.target === "local" || workspace.target === "docker") {
      return this.hostWorkspaceClient;
    }

    throw new Error(
      `Workspace ${workspace.id} uses unsupported target '${workspace.target}'.`,
    );
  }

  private resolveWorkspaceFileClientForRecord(
    workspace: Pick<WorkspaceRecord, "id" | "target" | "worktree_path">,
  ): WorkspaceClient {
    if (workspace.worktree_path !== null) {
      return this.hostWorkspaceClient;
    }

    return this.resolveWorkspaceClientForRecord(workspace);
  }

  private async resolveWorkspaceFacts(
    workspaceId: string,
  ): Promise<Pick<WorkspaceRecord, "id" | "target" | "worktree_path">> {
    const cachedFacts = this.workspaceFactsCache.get(workspaceId);
    if (cachedFacts) {
      return { id: workspaceId, ...cachedFacts };
    }

    const workspace = await this.backend.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} was not found.`);
    }

    this.workspaceFactsCache.set(workspaceId, {
      target: workspace.target,
      worktree_path: workspace.worktree_path,
    });

    return {
      id: workspace.id,
      target: workspace.target,
      worktree_path: workspace.worktree_path,
    };
  }

  private async resolveWorkspaceClientForId(workspaceId: string): Promise<WorkspaceClient> {
    return this.resolveWorkspaceClientForRecord(await this.resolveWorkspaceFacts(workspaceId));
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

  private async withWorkspaceFileClient<T>(
    workspaceId: string,
    run: (client: WorkspaceClient) => Promise<T>,
  ): Promise<T> {
    return run(this.resolveWorkspaceFileClientForRecord(await this.resolveWorkspaceFacts(workspaceId)));
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
    return this.withWorkspaceFileClient(workspaceId, (client) =>
      client.readFile(workspaceId, filePath),
    );
  }

  writeFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult> {
    return this.withWorkspaceFileClient(workspaceId, (client) =>
      client.writeFile(workspaceId, filePath, content),
    );
  }

  subscribeFileEvents(
    input: SubscribeWorkspaceFileEventsInput,
    listener: WorkspaceFileEventListener,
  ): Promise<WorkspaceFileEventSubscription> {
    return this.withWorkspaceFileClient(input.workspaceId, (client) =>
      client.subscribeFileEvents(input, listener),
    );
  }

  listFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]> {
    return this.withWorkspaceFileClient(workspaceId, (client) => client.listFiles(workspaceId));
  }

  openFile(workspaceId: string, filePath: string): Promise<void> {
    return this.withWorkspaceFileClient(workspaceId, (client) =>
      client.openFile(workspaceId, filePath),
    );
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
