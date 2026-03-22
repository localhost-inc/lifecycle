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
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import { isTauri } from "@tauri-apps/api/core";
import { publishBrowserLifecycleEvent } from "@/features/events/api";

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

export async function getGitStatus(
  runtime: WorkspaceRuntime,
  workspaceId: string,
): Promise<GitStatusResult> {
  if (!isTauri()) {
    return EMPTY_STATUS;
  }

  return runtime.getGitStatus(workspaceId);
}

export async function getGitDiff(
  runtime: WorkspaceRuntime,
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

  return runtime.getGitDiff({
    workspaceId,
    filePath,
    scope,
  });
}

export async function getGitScopePatch(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  scope: GitDiffScope,
): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return runtime.getGitScopePatch(workspaceId, scope);
}

export async function getGitChangesPatch(
  runtime: WorkspaceRuntime,
  workspaceId: string,
): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return runtime.getGitChangesPatch(workspaceId);
}

export async function getGitLog(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  limit: number,
): Promise<GitLogEntry[]> {
  if (!isTauri()) {
    return [];
  }

  return runtime.listGitLog(workspaceId, limit);
}

export async function getGitPullRequests(
  runtime: WorkspaceRuntime,
  workspaceId: string,
): Promise<GitPullRequestListResult> {
  if (!isTauri()) {
    return EMPTY_PULL_REQUEST_LIST_RESULT;
  }

  return runtime.listGitPullRequests(workspaceId);
}

export async function getCurrentGitPullRequest(
  runtime: WorkspaceRuntime,
  workspaceId: string,
): Promise<GitBranchPullRequestResult> {
  if (!isTauri()) {
    return EMPTY_BRANCH_PULL_REQUEST_RESULT;
  }

  return runtime.getCurrentGitPullRequest(workspaceId);
}

export async function getGitPullRequest(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  pullRequestNumber: number,
): Promise<GitPullRequestDetailResult> {
  if (!isTauri()) {
    return EMPTY_PULL_REQUEST_DETAIL_RESULT;
  }

  return runtime.getGitPullRequest(workspaceId, pullRequestNumber);
}

export async function getGitBaseRef(
  runtime: WorkspaceRuntime,
  workspaceId: string,
): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  return runtime.getGitBaseRef(workspaceId);
}

export async function getGitRefDiffPatch(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  baseRef: string,
  headRef: string,
): Promise<string> {
  if (!isTauri()) return "";
  return runtime.getGitRefDiffPatch(workspaceId, baseRef, headRef);
}

export async function getGitPullRequestPatch(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  pullRequestNumber: number,
): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return runtime.getGitPullRequestPatch(workspaceId, pullRequestNumber);
}

export async function getGitCommitPatch(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  sha: string,
): Promise<GitCommitDiffResult> {
  if (!isTauri()) {
    return {
      sha,
      patch: "",
    };
  }

  return runtime.getGitCommitPatch(workspaceId, sha);
}

export async function stageGitFiles(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) {
    return;
  }

  if (!isTauri()) {
    emitBrowserGitStatusChanged(workspaceId);
    return;
  }

  await runtime.stageGitFiles(workspaceId, filePaths);
}

export async function unstageGitFiles(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) {
    return;
  }

  if (!isTauri()) {
    emitBrowserGitStatusChanged(workspaceId);
    return;
  }

  await runtime.unstageGitFiles(workspaceId, filePaths);
}

export async function commitGit(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  message: string,
): Promise<GitCommitResult> {
  if (!isTauri()) {
    const result = browserCommitResult(message);
    emitBrowserGitHeadChanged(workspaceId, { headSha: result.sha });
    emitBrowserGitLogChanged(workspaceId, result.sha);
    emitBrowserGitStatusChanged(workspaceId);
    return result;
  }

  return runtime.commitGit(workspaceId, message);
}

export async function pushGit(
  runtime: WorkspaceRuntime,
  workspaceId: string,
): Promise<GitPushResult> {
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

  return runtime.pushGit(workspaceId);
}

export async function createGitPullRequest(
  runtime: WorkspaceRuntime,
  workspaceId: string,
): Promise<GitPullRequestSummary> {
  if (!isTauri()) {
    throw new Error("Pull request creation is only available in the desktop app.");
  }

  return runtime.createGitPullRequest(workspaceId);
}

export async function mergeGitPullRequest(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  pullRequestNumber: number,
): Promise<GitPullRequestSummary> {
  if (!isTauri()) {
    throw new Error("Pull request merge is only available in the desktop app.");
  }

  return runtime.mergeGitPullRequest(workspaceId, pullRequestNumber);
}
