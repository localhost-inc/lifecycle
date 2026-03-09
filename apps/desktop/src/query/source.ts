import type {
  GitBranchPullRequestResult,
  GitLogEntry,
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
  getGitPullRequests,
  getGitStatus,
} from "../features/git/api";
import type { ManifestStatus } from "../features/projects/api/projects";
import { getTerminal, listWorkspaceTerminals } from "../features/terminals/api";
import { listProjects, readManifest } from "../features/projects/api/projects";
import { getWorkspaceById, getWorkspaceServices, listWorkspacesByProject } from "../features/workspaces/api";

export interface QuerySource {
  listProjects(): Promise<ProjectRecord[]>;
  readManifest(projectPath: string): Promise<ManifestStatus>;
  listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]>;
  getWorkspaceGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]>;
  getWorkspaceGitPullRequests(workspaceId: string): Promise<GitPullRequestListResult>;
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
    getWorkspaceGitLog: getGitLog,
    getWorkspaceGitPullRequests: getGitPullRequests,
    getWorkspaceCurrentGitPullRequest: getCurrentGitPullRequest,
    getWorkspaceGitStatus: getGitStatus,
    getWorkspaceServices,
    getTerminal,
    listWorkspaceTerminals,
  };
}
