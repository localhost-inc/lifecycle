import type {
  GitCommitDiffResult,
  GitCommitResult,
  GitDiffResult,
  GitDiffScope,
  GitLogEntry,
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

export async function getGitLog(workspaceId: string, limit: number): Promise<GitLogEntry[]> {
  if (!isTauri()) {
    return [];
  }

  return invoke<GitLogEntry[]>("list_workspace_git_log", {
    workspaceId,
    limit,
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

export async function stageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("stage_workspace_git_files", {
    workspaceId,
    filePaths,
  });
}

export async function unstageGitFiles(workspaceId: string, filePaths: string[]): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("unstage_workspace_git_files", {
    workspaceId,
    filePaths,
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
