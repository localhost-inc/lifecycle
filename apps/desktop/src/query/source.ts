import type {
  EnvironmentRecord,
  GitBranchPullRequestResult,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitStatusResult,
  LifecycleEvent,
  ProjectRecord,
  ServiceRecord,
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import {
  getCurrentGitPullRequest,
  getGitLog,
  getGitPullRequest,
  getGitPullRequests,
  getGitStatus,
} from "@/features/git/api";
import type { ManifestStatus } from "@/features/projects/api/projects";
import { getTerminal, listWorkspaceTerminals } from "@/features/terminals/api";
import { listProjects, readManifest } from "@/features/projects/api/projects";
import { listWorkspacesByProject } from "@/features/workspaces/catalog-api";
import {
  getWorkspaceActivity,
  getWorkspaceById,
  getWorkspaceEnvironment,
  getWorkspaceServiceLogs,
  listWorkspaceFiles,
  readWorkspaceFile,
  getWorkspaceServices,
  type WorkspaceFileTreeEntry,
  type WorkspaceFileReadResult,
  type ServiceLogSnapshot,
} from "@/features/workspaces/api";
import { measureAsyncPerformance } from "@/lib/performance";

export interface QuerySource {
  listProjects(): Promise<ProjectRecord[]>;
  readManifest(projectPath: string): Promise<ManifestStatus>;
  listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  getWorkspaceEnvironment(workspaceId: string): Promise<EnvironmentRecord>;
  getWorkspaceActivity(workspaceId: string): Promise<LifecycleEvent[]>;
  getWorkspaceFile(workspaceId: string, filePath: string): Promise<WorkspaceFileReadResult>;
  getWorkspaceServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]>;
  listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]>;
  getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]>;
  getWorkspaceGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]>;
  getWorkspaceGitPullRequests(workspaceId: string): Promise<GitPullRequestListResult>;
  getWorkspaceGitPullRequest(
    workspaceId: string,
    pullRequestNumber: number,
  ): Promise<GitPullRequestDetailResult>;
  getWorkspaceCurrentGitPullRequest(workspaceId: string): Promise<GitBranchPullRequestResult>;
  getWorkspaceGitStatus(workspaceId: string): Promise<GitStatusResult>;
  listWorkspaceTerminals(workspaceId: string): Promise<TerminalRecord[]>;
  getTerminal(terminalId: string): Promise<TerminalRecord | null>;
}

export function createQuerySource(): QuerySource {
  const measureWorkspace = <T>(label: string, workspaceId: string, task: () => Promise<T>) =>
    measureAsyncPerformance(`${label}:${workspaceId}`, task);

  return {
    async listProjects() {
      return measureAsyncPerformance("query.list-projects", () => listProjects());
    },
    async readManifest(projectPath) {
      return measureAsyncPerformance(`query.read-manifest:${projectPath}`, () =>
        readManifest(projectPath),
      );
    },
    async listWorkspacesByProject() {
      return measureAsyncPerformance("query.list-workspaces-by-project", () =>
        listWorkspacesByProject(),
      );
    },
    async getWorkspace(workspaceId) {
      return measureWorkspace("query.workspace", workspaceId, () => getWorkspaceById(workspaceId));
    },
    async getWorkspaceEnvironment(workspaceId) {
      return measureWorkspace("query.workspace-environment", workspaceId, () =>
        getWorkspaceEnvironment(workspaceId),
      );
    },
    async getWorkspaceActivity(workspaceId) {
      return measureWorkspace("query.workspace-activity", workspaceId, () =>
        getWorkspaceActivity(workspaceId),
      );
    },
    async getWorkspaceFile(workspaceId, filePath) {
      return measureWorkspace("query.workspace-file", workspaceId, () =>
        readWorkspaceFile(workspaceId, filePath),
      );
    },
    async getWorkspaceServiceLogs(workspaceId) {
      return measureWorkspace("query.workspace-service-logs", workspaceId, () =>
        getWorkspaceServiceLogs(workspaceId),
      );
    },
    async listWorkspaceFiles(workspaceId) {
      return measureWorkspace("query.workspace-file-tree", workspaceId, () =>
        listWorkspaceFiles(workspaceId),
      );
    },
    async getWorkspaceServices(workspaceId) {
      return measureWorkspace("query.workspace-services", workspaceId, () =>
        getWorkspaceServices(workspaceId),
      );
    },
    async getWorkspaceGitLog(workspaceId, limit) {
      return measureWorkspace("query.git-log", workspaceId, () => getGitLog(workspaceId, limit));
    },
    async getWorkspaceGitPullRequests(workspaceId) {
      return measureWorkspace("query.git-pull-requests", workspaceId, () =>
        getGitPullRequests(workspaceId),
      );
    },
    async getWorkspaceGitPullRequest(workspaceId, pullRequestNumber) {
      return measureWorkspace("query.git-pull-request", workspaceId, () =>
        getGitPullRequest(workspaceId, pullRequestNumber),
      );
    },
    async getWorkspaceCurrentGitPullRequest(workspaceId) {
      return measureWorkspace("query.git-current-pull-request", workspaceId, () =>
        getCurrentGitPullRequest(workspaceId),
      );
    },
    async getWorkspaceGitStatus(workspaceId) {
      return measureWorkspace("query.git-status", workspaceId, () => getGitStatus(workspaceId));
    },
    async listWorkspaceTerminals(workspaceId) {
      return measureWorkspace("query.workspace-terminals", workspaceId, () =>
        listWorkspaceTerminals(workspaceId),
      );
    },
    async getTerminal(terminalId) {
      return measureAsyncPerformance(`query.terminal:${terminalId}`, () => getTerminal(terminalId));
    },
  };
}
