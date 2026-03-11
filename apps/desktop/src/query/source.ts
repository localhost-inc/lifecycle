import type {
  GitBranchPullRequestResult,
  GitLogEntry,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitStatusResult,
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
} from "../features/git/api";
import type { ManifestStatus } from "../features/projects/api/projects";
import { getTerminal, listWorkspaceTerminals } from "../features/terminals/api";
import { listProjects, readManifest } from "../features/projects/api/projects";
import {
  getWorkspaceById,
  readWorkspaceFile,
  getWorkspaceServices,
  listWorkspacesByProject,
  type WorkspaceFileReadResult,
} from "../features/workspaces/api";

export interface QuerySource {
  listProjects(): Promise<ProjectRecord[]>;
  readManifest(projectPath: string): Promise<ManifestStatus>;
  listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  getWorkspaceFile(workspaceId: string, filePath: string): Promise<WorkspaceFileReadResult>;
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
  return {
    listProjects,
    readManifest,
    listWorkspacesByProject,
    getWorkspace: getWorkspaceById,
    getWorkspaceFile: readWorkspaceFile,
    getWorkspaceGitLog: getGitLog,
    getWorkspaceGitPullRequests: getGitPullRequests,
    getWorkspaceGitPullRequest: getGitPullRequest,
    getWorkspaceCurrentGitPullRequest: getCurrentGitPullRequest,
    getWorkspaceGitStatus: getGitStatus,
    getWorkspaceServices,
    getTerminal,
    listWorkspaceTerminals,
  };
}
