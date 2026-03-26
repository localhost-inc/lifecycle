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
import type { WorkspaceHostClient } from "@lifecycle/workspace/client";
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
    kind: "git.status.changed",
    workspaceId,
    branch: null,
    headSha: null,
    upstream: null,
  });
}

function emitBrowserGitHeadChanged(
  workspaceId: string,
  options?: { ahead?: number | null; behind?: number | null; headSha?: string | null },
): void {
  publishBrowserLifecycleEvent({
    kind: "git.head.changed",
    workspaceId,
    branch: null,
    headSha: options?.headSha ?? null,
    upstream: null,
    ahead: options?.ahead ?? 0,
    behind: options?.behind ?? 0,
  });
}

function emitBrowserGitLogChanged(workspaceId: string, headSha: string | null): void {
  publishBrowserLifecycleEvent({
    kind: "git.log.changed",
    workspaceId,
    branch: null,
    headSha: headSha,
  });
}

export async function getGitStatus(
  client: WorkspaceHostClient,
  workspaceId: string,
): Promise<GitStatusResult> {
  if (!isTauri()) {
    return EMPTY_STATUS;
  }

  return client.getGitStatus(workspaceId);
}

export async function getGitDiff(
  client: WorkspaceHostClient,
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

  return client.getGitDiff({
    workspaceId,
    filePath,
    scope,
  });
}

export async function getGitScopePatch(
  client: WorkspaceHostClient,
  workspaceId: string,
  scope: GitDiffScope,
): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return client.getGitScopePatch(workspaceId, scope);
}

export async function getGitChangesPatch(
  client: WorkspaceHostClient,
  workspaceId: string,
): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return client.getGitChangesPatch(workspaceId);
}

export async function getGitLog(
  client: WorkspaceHostClient,
  workspaceId: string,
  limit: number,
): Promise<GitLogEntry[]> {
  if (!isTauri()) {
    return [];
  }

  return client.listGitLog(workspaceId, limit);
}

export async function getGitPullRequests(
  client: WorkspaceHostClient,
  workspaceId: string,
): Promise<GitPullRequestListResult> {
  if (!isTauri()) {
    return EMPTY_PULL_REQUEST_LIST_RESULT;
  }

  return client.listGitPullRequests(workspaceId);
}

export async function getCurrentGitPullRequest(
  client: WorkspaceHostClient,
  workspaceId: string,
): Promise<GitBranchPullRequestResult> {
  if (!isTauri()) {
    return EMPTY_BRANCH_PULL_REQUEST_RESULT;
  }

  return client.getCurrentGitPullRequest(workspaceId);
}

export async function getGitPullRequest(
  client: WorkspaceHostClient,
  workspaceId: string,
  pullRequestNumber: number,
): Promise<GitPullRequestDetailResult> {
  if (!isTauri()) {
    return EMPTY_PULL_REQUEST_DETAIL_RESULT;
  }

  return client.getGitPullRequest(workspaceId, pullRequestNumber);
}

export async function getGitBaseRef(
  client: WorkspaceHostClient,
  workspaceId: string,
): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  return client.getGitBaseRef(workspaceId);
}

export async function getGitRefDiffPatch(
  client: WorkspaceHostClient,
  workspaceId: string,
  baseRef: string,
  headRef: string,
): Promise<string> {
  if (!isTauri()) return "";
  return client.getGitRefDiffPatch(workspaceId, baseRef, headRef);
}

export async function getGitPullRequestPatch(
  client: WorkspaceHostClient,
  workspaceId: string,
  pullRequestNumber: number,
): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return client.getGitPullRequestPatch(workspaceId, pullRequestNumber);
}

export async function getGitCommitPatch(
  client: WorkspaceHostClient,
  workspaceId: string,
  sha: string,
): Promise<GitCommitDiffResult> {
  if (!isTauri()) {
    return {
      sha,
      patch: "",
    };
  }

  return client.getGitCommitPatch(workspaceId, sha);
}

export async function stageGitFiles(
  client: WorkspaceHostClient,
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

  await client.stageGitFiles(workspaceId, filePaths);
}

export async function unstageGitFiles(
  client: WorkspaceHostClient,
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

  await client.unstageGitFiles(workspaceId, filePaths);
}

export async function commitGit(
  client: WorkspaceHostClient,
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

  return client.commitGit(workspaceId, message);
}

export async function pushGit(
  client: WorkspaceHostClient,
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

  return client.pushGit(workspaceId);
}

export async function createGitPullRequest(
  client: WorkspaceHostClient,
  workspaceId: string,
): Promise<GitPullRequestSummary> {
  if (!isTauri()) {
    throw new Error("Pull request creation is only available in the desktop app.");
  }

  return client.createGitPullRequest(workspaceId);
}

export async function mergeGitPullRequest(
  client: WorkspaceHostClient,
  workspaceId: string,
  pullRequestNumber: number,
): Promise<GitPullRequestSummary> {
  if (!isTauri()) {
    throw new Error("Pull request merge is only available in the desktop app.");
  }

  return client.mergeGitPullRequest(workspaceId, pullRequestNumber);
}
