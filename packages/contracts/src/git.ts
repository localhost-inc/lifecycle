export type GitDiffScope = "working" | "staged" | "branch";

export type GitFileChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "unmerged"
  | "untracked"
  | "ignored"
  | "type_changed";

export interface GitFileStats {
  insertions: number | null;
  deletions: number | null;
}

export interface GitFileStatus {
  path: string;
  originalPath?: string | null;
  indexStatus: GitFileChangeKind | null;
  worktreeStatus: GitFileChangeKind | null;
  staged: boolean;
  unstaged: boolean;
  stats: GitFileStats;
}

export interface GitStatusResult {
  branch: string | null;
  headSha: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
}

export interface GitLogEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  email: string;
  timestamp: string;
}

export interface GitDiffResult {
  scope: GitDiffScope;
  filePath: string;
  originalPath?: string | null;
  patch: string;
  isBinary: boolean;
}

export interface GitCommitResult {
  sha: string;
  shortSha: string;
  message: string;
}

export interface GitCommitDiffResult {
  sha: string;
  patch: string;
}

export interface GitPushResult {
  branch: string | null;
  remote: string | null;
  ahead: number;
  behind: number;
}
