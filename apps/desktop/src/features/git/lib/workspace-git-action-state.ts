import type {
  GitBranchPullRequestResult,
  GitPullRequestSummary,
  GitStatusResult,
} from "@lifecycle/contracts";

export type WorkspaceGitRemoteSyncKind =
  | "unpublished"
  | "needs_push"
  | "behind"
  | "diverged"
  | "up_to_date";

export type WorkspaceGitActionStateKind =
  | "loading"
  | "detached"
  | "needs_stage"
  | "needs_commit"
  | "needs_push"
  | "blocked_behind"
  | "blocked_diverged"
  | "no_pull_request_changes"
  | "provider_unavailable"
  | "ready_to_create_pull_request"
  | "view_pull_request"
  | "ready_to_merge";

export type WorkspaceGitPrimaryActionKind =
  | "disabled"
  | "show_changes"
  | "commit"
  | "commit_and_push"
  | "push"
  | "create_pull_request"
  | "open_pull_request"
  | "merge_pull_request";

export interface WorkspaceGitPrimaryAction {
  kind: WorkspaceGitPrimaryActionKind;
  label: string;
}

export interface WorkspaceGitActionState {
  branch: string | null;
  description: string;
  hasLocalChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  kind: WorkspaceGitActionStateKind;
  primaryAction: WorkspaceGitPrimaryAction;
  pullRequest: GitPullRequestSummary | null;
  suggestedBaseRef: string | null;
  syncKind: WorkspaceGitRemoteSyncKind | null;
  title: string;
}

interface LocalChangesSummary {
  hasLocalChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
}

interface RemoteSyncSummary {
  canPushAfterCommit: boolean;
  kind: WorkspaceGitRemoteSyncKind | null;
}

interface BuildWorkspaceGitActionStateOptions {
  isLoading?: boolean;
}

function summarizeLocalChanges(gitStatus: GitStatusResult | null): LocalChangesSummary {
  const files = gitStatus?.files ?? [];
  return {
    hasLocalChanges: files.length > 0,
    hasStagedChanges: files.some((file) => file.staged),
    hasUnstagedChanges: files.some((file) => file.unstaged),
  };
}

function summarizeRemoteSync(gitStatus: GitStatusResult | null): RemoteSyncSummary {
  if (!gitStatus?.branch) {
    return {
      canPushAfterCommit: false,
      kind: null,
    };
  }

  if (!gitStatus.upstream) {
    return {
      canPushAfterCommit: true,
      kind: "unpublished",
    };
  }

  if (gitStatus.behind > 0 && gitStatus.ahead > 0) {
    return {
      canPushAfterCommit: false,
      kind: "diverged",
    };
  }

  if (gitStatus.behind > 0) {
    return {
      canPushAfterCommit: false,
      kind: "behind",
    };
  }

  if (gitStatus.ahead > 0) {
    return {
      canPushAfterCommit: true,
      kind: "needs_push",
    };
  }

  return {
    canPushAfterCommit: true,
    kind: "up_to_date",
  };
}

function disabledAction(label = "Git Status"): WorkspaceGitPrimaryAction {
  return {
    kind: "disabled",
    label,
  };
}

function syncHint(syncKind: WorkspaceGitRemoteSyncKind | null): string {
  switch (syncKind) {
    case "behind":
      return " Pull the latest remote commits in a terminal before you can push or open a pull request.";
    case "diverged":
      return " Reconcile the local and remote branch history in a terminal before you can push or open a pull request.";
    default:
      return "";
  }
}

export function buildWorkspaceGitActionState(
  gitStatus: GitStatusResult | null,
  branchPullRequest: GitBranchPullRequestResult | null,
  options?: BuildWorkspaceGitActionStateOptions,
): WorkspaceGitActionState {
  const branch = branchPullRequest?.branch ?? gitStatus?.branch ?? null;
  const pullRequest = branchPullRequest?.pullRequest ?? null;
  const hasPullRequestChanges = branchPullRequest?.hasPullRequestChanges ?? null;
  const support = branchPullRequest?.support ?? null;
  const suggestedBaseRef = branchPullRequest?.suggestedBaseRef ?? null;
  const { hasLocalChanges, hasStagedChanges, hasUnstagedChanges } =
    summarizeLocalChanges(gitStatus);
  const sync = summarizeRemoteSync(gitStatus);
  const isLoading = options?.isLoading ?? false;

  if (!gitStatus && !branchPullRequest && isLoading) {
    return {
      branch: null,
      description: "Checking the current branch, working tree, and pull request state.",
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "loading",
      primaryAction: disabledAction(),
      pullRequest: null,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Loading git actions",
    };
  }

  if (!branch && support && !support.available) {
    return {
      branch: null,
      description:
        support.message ?? "Pull request actions are not available for this workspace yet.",
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "provider_unavailable",
      primaryAction: disabledAction(),
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Pull request provider unavailable",
    };
  }

  if (!branch) {
    return {
      branch: null,
      description: "Checkout a branch to push commits or prepare a pull request.",
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "detached",
      primaryAction: disabledAction(),
      pullRequest: null,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "No branch selected",
    };
  }

  if (hasLocalChanges) {
    if (!hasStagedChanges) {
      return {
        branch,
        description: `Stage the files you want to include, then commit them before pushing or opening a pull request.${syncHint(sync.kind)}`,
        hasLocalChanges,
        hasStagedChanges,
        hasUnstagedChanges,
        kind: "needs_stage",
        primaryAction: {
          kind: "show_changes",
          label: "Stage Changes",
        },
        pullRequest,
        suggestedBaseRef,
        syncKind: sync.kind,
        title: "Stage changes to commit",
      };
    }

    return {
      branch,
      description: hasUnstagedChanges
        ? `Commit the staged changes. Unstaged edits can stay in the working tree.${syncHint(sync.kind)}`
        : `Commit the staged changes before pushing or opening a pull request.${syncHint(sync.kind)}`,
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "needs_commit",
      primaryAction: sync.canPushAfterCommit
        ? {
            kind: "commit_and_push",
            label: "Commit & Push",
          }
        : {
            kind: "commit",
            label: "Commit",
          },
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Commit your staged changes",
    };
  }

  if (sync.kind === "unpublished") {
    return {
      branch,
      description: `Push ${branch} to create its remote branch before opening a pull request.`,
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "needs_push",
      primaryAction: {
        kind: "push",
        label: "Push Branch",
      },
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Create the remote branch",
    };
  }

  if (sync.kind === "needs_push") {
    const commitCount = gitStatus?.ahead ?? 0;
    return {
      branch,
      description: `Push ${commitCount} local ${commitCount === 1 ? "commit" : "commits"} to update the remote branch.`,
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "needs_push",
      primaryAction: {
        kind: "push",
        label: "Push Branch",
      },
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Push the latest commits",
    };
  }

  if (sync.kind === "behind") {
    return {
      branch,
      description:
        "This branch is behind its upstream. Pull the latest remote commits in a terminal before pushing or opening a pull request.",
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "blocked_behind",
      primaryAction: disabledAction("Sync Branch"),
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Pull the latest remote commits",
    };
  }

  if (sync.kind === "diverged") {
    return {
      branch,
      description:
        "This branch has local and remote commits. Reconcile the divergence in a terminal before pushing or opening a pull request.",
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "blocked_diverged",
      primaryAction: disabledAction("Sync Branch"),
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Resolve branch divergence",
    };
  }

  if (isLoading && branchPullRequest === null) {
    return {
      branch,
      description: "Checking pull request state for this branch.",
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "loading",
      primaryAction: disabledAction(),
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Loading git actions",
    };
  }

  if (!support?.available) {
    return {
      branch,
      description:
        support?.message ?? "Pull request actions are not available for this workspace yet.",
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "provider_unavailable",
      primaryAction: disabledAction(),
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Pull request provider unavailable",
    };
  }

  if (!pullRequest && hasPullRequestChanges === false) {
    const baseRef = suggestedBaseRef ?? "the base branch";
    return {
      branch,
      description: `${branch} matches ${baseRef}, so there is nothing to open as a pull request yet.`,
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "no_pull_request_changes",
      primaryAction: disabledAction("No PR Changes"),
      pullRequest: null,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "No pull request changes",
    };
  }

  if (!pullRequest) {
    const baseRef = suggestedBaseRef ?? "the default branch";
    return {
      branch,
      description: `${branch} is pushed and ready to open a pull request into ${baseRef}.`,
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "ready_to_create_pull_request",
      primaryAction: {
        kind: "create_pull_request",
        label: "Create PR",
      },
      pullRequest: null,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Create a pull request",
    };
  }

  if (!pullRequest.isDraft && pullRequest.mergeable === "mergeable") {
    return {
      branch,
      description: `PR #${pullRequest.number} is open and currently mergeable.`,
      hasLocalChanges,
      hasStagedChanges,
      hasUnstagedChanges,
      kind: "ready_to_merge",
      primaryAction: {
        kind: "merge_pull_request",
        label: "Merge PR",
      },
      pullRequest,
      suggestedBaseRef,
      syncKind: sync.kind,
      title: "Ready to merge",
    };
  }

  return {
    branch,
    description: `PR #${pullRequest.number} is open for ${branch}. Review it before merging.`,
    hasLocalChanges,
    hasStagedChanges,
    hasUnstagedChanges,
    kind: "view_pull_request",
    primaryAction: {
      kind: "open_pull_request",
      label: "Open PR",
    },
    pullRequest,
    suggestedBaseRef,
    syncKind: sync.kind,
    title: `PR #${pullRequest.number} is open`,
  };
}
