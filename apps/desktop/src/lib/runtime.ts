import type { WorkspaceRecord, TerminalRecord } from "@lifecycle/contracts";
import {
  type EnvironmentStartInput,
  LocalRuntime,
  type CreateTerminalInput,
  type GitDiffInput,
  type Runtime,
  type SavedTerminalAttachment,
  type SaveTerminalAttachmentInput,
  type ServiceLogSnapshot,
  type WorkspaceFileReadResult,
  type WorkspaceFileTreeEntry,
  type WorkspaceHealthResult,
} from "@lifecycle/runtime";
import { getBackend } from "@/lib/backend";
import { invokeTauri } from "@/lib/tauri-error";

let runtime: Runtime | null = null;
let localRuntime: Runtime | null = null;

export function getRuntime(): Runtime {
  runtime ??= new DesktopRuntime();
  return runtime;
}

export function resetRuntimeForTests(): void {
  runtime = null;
  localRuntime = null;
}

function getLocalRuntime(): Runtime {
  localRuntime ??= new LocalRuntime((command, args) => invokeTauri(command, args));
  return localRuntime;
}

function getCloudRuntime(): Runtime | null {
  return null;
}

class DesktopRuntime implements Runtime {
  private resolveRuntimeForWorkspace(workspace: Pick<WorkspaceRecord, "id" | "mode">): Runtime {
    if (workspace.mode === "local") {
      return getLocalRuntime();
    }

    const cloudRuntime = getCloudRuntime();
    if (cloudRuntime) {
      return cloudRuntime;
    }

    throw new Error(`Workspace ${workspace.id} uses cloud mode, but no cloud runtime is available.`);
  }

  private async resolveRuntimeForWorkspaceId(workspaceId: string): Promise<Runtime> {
    const workspace = await getBackend().getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} was not found.`);
    }
    return this.resolveRuntimeForWorkspace(workspace);
  }

  private async withWorkspaceRuntime<T>(
    workspaceId: string,
    run: (runtime: Runtime) => Promise<T>,
  ): Promise<T> {
    const runtime = await this.resolveRuntimeForWorkspaceId(workspaceId);
    return run(runtime);
  }

  private withResolvedWorkspaceRuntime<T>(
    workspace: Pick<WorkspaceRecord, "id" | "mode">,
    run: (runtime: Runtime) => Promise<T>,
  ): Promise<T> {
    return run(this.resolveRuntimeForWorkspace(workspace));
  }

  startEnvironment(input: EnvironmentStartInput) {
    return this.withResolvedWorkspaceRuntime(input.workspace, (runtime) =>
      runtime.startEnvironment(input),
    );
  }

  healthCheck(workspaceId: string): Promise<WorkspaceHealthResult> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.healthCheck(workspaceId));
  }

  stopEnvironment(workspaceId: string): Promise<void> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.stopEnvironment(workspaceId));
  }

  getEnvironment(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.getEnvironment(workspaceId));
  }

  getActivity(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.getActivity(workspaceId));
  }

  getServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.getServiceLogs(workspaceId));
  }

  getServices(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.getServices(workspaceId));
  }

  createTerminal(input: CreateTerminalInput) {
    return this.withWorkspaceRuntime(input.workspaceId, (runtime) => runtime.createTerminal(input));
  }

  async listTerminals(workspaceId: string): Promise<TerminalRecord[]> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.listTerminals(workspaceId));
  }

  renameTerminal(workspaceId: string, terminalId: string, label: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.renameTerminal(workspaceId, terminalId, label),
    );
  }

  saveTerminalAttachment(input: SaveTerminalAttachmentInput): Promise<SavedTerminalAttachment> {
    return this.withWorkspaceRuntime(input.workspaceId, (runtime) =>
      runtime.saveTerminalAttachment(input),
    );
  }

  detachTerminal(workspaceId: string, terminalId: string): Promise<void> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.detachTerminal(workspaceId, terminalId),
    );
  }

  killTerminal(workspaceId: string, terminalId: string): Promise<void> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.killTerminal(workspaceId, terminalId),
    );
  }

  interruptTerminal(workspaceId: string, terminalId: string): Promise<void> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.interruptTerminal(workspaceId, terminalId),
    );
  }

  readFile(workspaceId: string, filePath: string): Promise<WorkspaceFileReadResult> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.readFile(workspaceId, filePath));
  }

  writeFile(
    workspaceId: string,
    filePath: string,
    content: string,
  ): Promise<WorkspaceFileReadResult> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.writeFile(workspaceId, filePath, content),
    );
  }

  listFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.listFiles(workspaceId));
  }

  openFile(workspaceId: string, filePath: string): Promise<void> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.openFile(workspaceId, filePath));
  }

  getGitStatus(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.getGitStatus(workspaceId));
  }

  getGitScopePatch(workspaceId: string, scope: GitDiffInput["scope"]): Promise<string> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.getGitScopePatch(workspaceId, scope),
    );
  }

  getGitChangesPatch(workspaceId: string): Promise<string> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.getGitChangesPatch(workspaceId),
    );
  }

  getGitDiff(input: GitDiffInput) {
    return this.withWorkspaceRuntime(input.workspaceId, (runtime) => runtime.getGitDiff(input));
  }

  listGitLog(workspaceId: string, limit: number) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.listGitLog(workspaceId, limit));
  }

  listGitPullRequests(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.listGitPullRequests(workspaceId),
    );
  }

  getGitPullRequest(workspaceId: string, pullRequestNumber: number) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.getGitPullRequest(workspaceId, pullRequestNumber),
    );
  }

  getCurrentGitPullRequest(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.getCurrentGitPullRequest(workspaceId),
    );
  }

  getGitBaseRef(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.getGitBaseRef(workspaceId));
  }

  getGitRefDiffPatch(workspaceId: string, baseRef: string, headRef: string): Promise<string> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.getGitRefDiffPatch(workspaceId, baseRef, headRef),
    );
  }

  getGitPullRequestPatch(workspaceId: string, pullRequestNumber: number): Promise<string> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.getGitPullRequestPatch(workspaceId, pullRequestNumber),
    );
  }

  getGitCommitPatch(workspaceId: string, sha: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.getGitCommitPatch(workspaceId, sha),
    );
  }

  stageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.stageGitFiles(workspaceId, filePaths),
    );
  }

  unstageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.unstageGitFiles(workspaceId, filePaths),
    );
  }

  commitGit(workspaceId: string, message: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.commitGit(workspaceId, message));
  }

  pushGit(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) => runtime.pushGit(workspaceId));
  }

  createGitPullRequest(workspaceId: string) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.createGitPullRequest(workspaceId),
    );
  }

  mergeGitPullRequest(workspaceId: string, pullRequestNumber: number) {
    return this.withWorkspaceRuntime(workspaceId, (runtime) =>
      runtime.mergeGitPullRequest(workspaceId, pullRequestNumber),
    );
  }
}
