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
} from "@lifecycle/contracts";
import { isTauri } from "@tauri-apps/api/core";
import { invokeTauri } from "../../lib/tauri-error";
import { publishBrowserLifecycleEvent } from "../events/api";

const EMPTY_STATUS: GitStatusResult = {
  branch: null,
  headSha: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  files: [],
};

const EMPTY_PULL_REQUEST_SUPPORT = {
  available: false,
  message: "Pull requests are only available in the desktop app.",
  provider: null,
  reason: "mode_not_supported",
} as const;

const EMPTY_PULL_REQUEST_LIST_RESULT: GitPullRequestListResult = {
  support: EMPTY_PULL_REQUEST_SUPPORT,
  pullRequests: [],
};

const EMPTY_BRANCH_PULL_REQUEST_RESULT: GitBranchPullRequestResult = {
  support: EMPTY_PULL_REQUEST_SUPPORT,
  branch: null,
  hasPullRequestChanges: null,
  upstream: null,
  suggestedBaseRef: null,
  pullRequest: null,
};

const EMPTY_PULL_REQUEST_DETAIL_RESULT: GitPullRequestDetailResult = {
  support: EMPTY_PULL_REQUEST_SUPPORT,
  pullRequest: null,
};

function browserCommitResult(message: string): GitCommitResult {
  const sha = crypto.randomUUID().replaceAll("-", "");
  return {
    sha,
    shortSha: sha.slice(0, 8),
    message,
  };
}

function emitBrowserGitStatusChanged(workspaceId: string): void {
  publishBrowserLifecycleEvent({
    kind: "git.status_changed",
    workspace_id: workspaceId,
    branch: null,
    head_sha: null,
    upstream: null,
  });
}

function emitBrowserGitHeadChanged(
  workspaceId: string,
  options?: { ahead?: number | null; behind?: number | null; headSha?: string | null },
): void {
  publishBrowserLifecycleEvent({
    kind: "git.head_changed",
    workspace_id: workspaceId,
    branch: null,
    head_sha: options?.headSha ?? null,
    upstream: null,
    ahead: options?.ahead ?? 0,
    behind: options?.behind ?? 0,
  });
}

function emitBrowserGitLogChanged(workspaceId: string, headSha: string | null): void {
  publishBrowserLifecycleEvent({
    kind: "git.log_changed",
    workspace_id: workspaceId,
    branch: null,
    head_sha: headSha,
  });
}

export async function getGitStatus(workspaceId: string): Promise<GitStatusResult> {
  if (!isTauri()) {
    return EMPTY_STATUS;
  }

  return invokeTauri<GitStatusResult>("get_workspace_git_status", {
    workspaceId,
  });
}

export async function getGitDiff(
  workspaceId: string,
  filePath: string,
  scope: GitDiffScope,
): Promise<GitDiffResult> {
  if (!isTauri()) {
    return {
      scope,
      filePath,
      patch: "",
      isBinary: false,
    };
  }

  return invokeTauri<GitDiffResult>("get_workspace_git_diff", {
    workspaceId,
    filePath,
    scope,
  });
}

export async function getGitScopePatch(workspaceId: string, scope: GitDiffScope): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return invokeTauri<string>("get_workspace_git_scope_patch", {
    workspaceId,
    scope,
  });
}

export async function getGitChangesPatch(workspaceId: string): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return invokeTauri<string>("get_workspace_git_changes_patch", {
    workspaceId,
  });
}

export async function getGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]> {
  if (!isTauri()) {
    return [];
  }

  return invokeTauri<GitLogEntry[]>("list_workspace_git_log", {
    workspaceId,
    limit,
  });
}

export async function getGitPullRequests(workspaceId: string): Promise<GitPullRequestListResult> {
  if (!isTauri()) {
    return EMPTY_PULL_REQUEST_LIST_RESULT;
  }

  return invokeTauri<GitPullRequestListResult>("list_workspace_git_pull_requests", {
    workspaceId,
  });
}

export async function getCurrentGitPullRequest(
  workspaceId: string,
): Promise<GitBranchPullRequestResult> {
  if (!isTauri()) {
    return EMPTY_BRANCH_PULL_REQUEST_RESULT;
  }

  return invokeTauri<GitBranchPullRequestResult>("get_workspace_current_git_pull_request", {
    workspaceId,
  });
}

export async function getGitPullRequest(
  workspaceId: string,
  pullRequestNumber: number,
): Promise<GitPullRequestDetailResult> {
  if (!isTauri()) {
    return EMPTY_PULL_REQUEST_DETAIL_RESULT;
  }

  return invokeTauri<GitPullRequestDetailResult>("get_workspace_git_pull_request", {
    pullRequestNumber,
    workspaceId,
  });
}

export async function getGitBaseRef(workspaceId: string): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  return invokeTauri<string | null>("get_workspace_git_base_ref", {
    workspaceId,
  });
}

export async function getGitRefDiffPatch(
  workspaceId: string,
  baseRef: string,
  headRef: string,
): Promise<string> {
  if (!isTauri()) return "";
  return invokeTauri<string>("get_workspace_git_ref_diff_patch", {
    workspaceId,
    baseRef,
    headRef,
  });
}

export async function getGitPullRequestPatch(
  workspaceId: string,
  pullRequestNumber: number,
): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return invokeTauri<string>("get_workspace_git_pull_request_patch", {
    pullRequestNumber,
    workspaceId,
  });
}

export async function getGitCommitPatch(
  workspaceId: string,
  sha: string,
): Promise<GitCommitDiffResult> {
  if (!isTauri()) {
    return {
      sha,
      patch: "",
    };
  }

  return invokeTauri<GitCommitDiffResult>("get_workspace_git_commit_patch", {
    workspaceId,
    sha,
  });
}

export async function stageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) {
    return;
  }

  if (!isTauri()) {
    emitBrowserGitStatusChanged(workspaceId);
    return;
  }

  await invokeTauri("stage_workspace_git_files", {
    workspaceId,
    filePaths,
  });
}

export async function unstageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) {
    return;
  }

  if (!isTauri()) {
    emitBrowserGitStatusChanged(workspaceId);
    return;
  }

  await invokeTauri("unstage_workspace_git_files", {
    workspaceId,
    filePaths,
  });
}

export async function commitGit(workspaceId: string, message: string): Promise<GitCommitResult> {
  if (!isTauri()) {
    const result = browserCommitResult(message);
    emitBrowserGitHeadChanged(workspaceId, { headSha: result.sha });
    emitBrowserGitLogChanged(workspaceId, result.sha);
    emitBrowserGitStatusChanged(workspaceId);
    return result;
  }

  return invokeTauri<GitCommitResult>("commit_workspace_git", {
    workspaceId,
    message,
  });
}

export async function pushGit(workspaceId: string): Promise<GitPushResult> {
  if (!isTauri()) {
    const result = {
      branch: null,
      remote: null,
      ahead: 0,
      behind: 0,
    };
    emitBrowserGitHeadChanged(workspaceId, result);
    emitBrowserGitStatusChanged(workspaceId);
    return result;
  }

  return invokeTauri<GitPushResult>("push_workspace_git", {
    workspaceId,
  });
}

export async function createGitPullRequest(workspaceId: string): Promise<GitPullRequestSummary> {
  if (!isTauri()) {
    throw new Error("Pull request creation is only available in the desktop app.");
  }

  return invokeTauri<GitPullRequestSummary>("create_workspace_git_pull_request", {
    workspaceId,
  });
}

export async function mergeGitPullRequest(
  workspaceId: string,
  pullRequestNumber: number,
): Promise<GitPullRequestSummary> {
  if (!isTauri()) {
    throw new Error("Pull request merge is only available in the desktop app.");
  }

  return invokeTauri<GitPullRequestSummary>("merge_workspace_git_pull_request", {
    workspaceId,
    pullRequestNumber,
  });
}
