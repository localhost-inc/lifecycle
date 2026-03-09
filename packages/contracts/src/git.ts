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

export type GitPullRequestProvider = "github";

export type GitPullRequestState = "open" | "closed" | "merged";

export type GitPullRequestMergeable = "mergeable" | "conflicting" | "unknown";

export type GitPullRequestReviewDecision = "approved" | "changes_requested" | "review_required";

export type GitPullRequestCheckStatus = "pending" | "success" | "failed" | "neutral";

export type GitPullRequestSupportReason =
  | "mode_not_supported"
  | "provider_unavailable"
  | "authentication_required"
  | "repository_unavailable"
  | "unsupported_remote";

export interface GitPullRequestSupport {
  available: boolean;
  provider: GitPullRequestProvider | null;
  reason: GitPullRequestSupportReason | null;
  message: string | null;
}

export interface GitPullRequestCheckSummary {
  name: string;
  status: GitPullRequestCheckStatus;
  workflowName: string | null;
  detailsUrl: string | null;
}

export interface GitPullRequestSummary {
  number: number;
  title: string;
  url: string;
  state: GitPullRequestState;
  isDraft: boolean;
  author: string;
  headRefName: string;
  baseRefName: string;
  createdAt: string;
  updatedAt: string;
  mergeable: GitPullRequestMergeable;
  mergeStateStatus: string | null;
  reviewDecision: GitPullRequestReviewDecision | null;
  checks: GitPullRequestCheckSummary[] | null;
}

export interface GitPullRequestListResult {
  support: GitPullRequestSupport;
  pullRequests: GitPullRequestSummary[];
}

export interface GitBranchPullRequestResult {
  support: GitPullRequestSupport;
  branch: string | null;
  upstream: string | null;
  suggestedBaseRef: string | null;
  pullRequest: GitPullRequestSummary | null;
}
