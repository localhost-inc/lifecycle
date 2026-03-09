import type {
  GitBranchPullRequestResult,
  GitCommitDiffResult,
  GitCommitResult,
  GitDiffResult,
  GitDiffScope,
  GitLogEntry,
  GitPullRequestListResult,
  GitPullRequestSummary,
  GitPushResult,
  GitStatusResult,
} from "@lifecycle/contracts";
import { invoke, isTauri } from "@tauri-apps/api/core";

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
  upstream: null,
  suggestedBaseRef: null,
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

export async function getGitStatus(workspaceId: string): Promise<GitStatusResult> {
  if (!isTauri()) {
    return EMPTY_STATUS;
  }

  return invoke<GitStatusResult>("get_workspace_git_status", {
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

  return invoke<GitDiffResult>("get_workspace_git_diff", {
    workspaceId,
    filePath,
    scope,
  });
}

export async function getGitScopePatch(workspaceId: string, scope: GitDiffScope): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return invoke<string>("get_workspace_git_scope_patch", {
    workspaceId,
    scope,
  });
}

export async function getGitChangesPatch(workspaceId: string): Promise<string> {
  if (!isTauri()) {
    return "";
  }

  return invoke<string>("get_workspace_git_changes_patch", {
    workspaceId,
  });
}

export async function getGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]> {
  if (!isTauri()) {
    return [];
  }

  return invoke<GitLogEntry[]>("list_workspace_git_log", {
    workspaceId,
    limit,
  });
}

export async function getGitPullRequests(workspaceId: string): Promise<GitPullRequestListResult> {
  if (!isTauri()) {
    return EMPTY_PULL_REQUEST_LIST_RESULT;
  }

  return invoke<GitPullRequestListResult>("list_workspace_git_pull_requests", {
    workspaceId,
  });
}

export async function getCurrentGitPullRequest(
  workspaceId: string,
): Promise<GitBranchPullRequestResult> {
  if (!isTauri()) {
    return EMPTY_BRANCH_PULL_REQUEST_RESULT;
  }

  return invoke<GitBranchPullRequestResult>("get_workspace_current_git_pull_request", {
    workspaceId,
  });
}

export async function getGitBaseRef(workspaceId: string): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  return invoke<string | null>("get_workspace_git_base_ref", {
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

  return invoke<GitCommitDiffResult>("get_workspace_git_commit_patch", {
    workspaceId,
    sha,
  });
}

export async function openWorkspaceFile(workspaceId: string, filePath: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("open_workspace_file", {
    workspaceId,
    filePath,
  });
}

export async function commitGit(workspaceId: string, message: string): Promise<GitCommitResult> {
  if (!isTauri()) {
    return browserCommitResult(message);
  }

  return invoke<GitCommitResult>("commit_workspace_git", {
    workspaceId,
    message,
  });
}

export async function pushGit(workspaceId: string): Promise<GitPushResult> {
  if (!isTauri()) {
    return {
      branch: null,
      remote: null,
      ahead: 0,
      behind: 0,
    };
  }

  return invoke<GitPushResult>("push_workspace_git", {
    workspaceId,
  });
}

export async function createGitPullRequest(workspaceId: string): Promise<GitPullRequestSummary> {
  if (!isTauri()) {
    throw new Error("Pull request creation is only available in the desktop app.");
  }

  return invoke<GitPullRequestSummary>("create_workspace_git_pull_request", {
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

  return invoke<GitPullRequestSummary>("merge_workspace_git_pull_request", {
    workspaceId,
    pullRequestNumber,
  });
}
