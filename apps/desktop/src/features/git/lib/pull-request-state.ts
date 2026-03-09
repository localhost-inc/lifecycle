import type {
  GitBranchPullRequestResult,
  GitPullRequestSummary,
  GitStatusResult,
} from "@lifecycle/contracts";

export type GitPullRequestQuickStateKind =
  | "detached"
  | "needs_commit"
  | "needs_push"
  | "remote_unavailable"
  | "ready_to_create"
  | "view_pull_request"
  | "ready_to_merge";

export interface GitPullRequestQuickState {
  branch: string | null;
  description: string;
  kind: GitPullRequestQuickStateKind;
  pullRequest: GitPullRequestSummary | null;
  title: string;
}

export type GitPullRequestPrimaryActionKind =
  | "disabled"
  | "commit"
  | "commit_and_push"
  | "push"
  | "create_pull_request"
  | "open_pull_request"
  | "merge_pull_request";

export interface GitPullRequestPrimaryAction {
  kind: GitPullRequestPrimaryActionKind;
  label: string;
}

export function buildGitPullRequestQuickState(
  gitStatus: GitStatusResult | null,
  branchPullRequest: GitBranchPullRequestResult | null,
): GitPullRequestQuickState {
  const branch = branchPullRequest?.branch ?? gitStatus?.branch ?? null;
  const pullRequest = branchPullRequest?.pullRequest ?? null;
  const support = branchPullRequest?.support ?? null;
  const hasLocalChanges = (gitStatus?.files.length ?? 0) > 0;

  if (!branch && support && !support.available) {
    return {
      branch: null,
      description:
        support.message ??
        "Pull request actions are not available for this workspace yet.",
      kind: "remote_unavailable",
      pullRequest,
      title: "Pull request provider unavailable",
    };
  }

  if (!branch) {
    return {
      branch: null,
      description: "Checkout a branch to prepare a pull request.",
      kind: "detached",
      pullRequest: null,
      title: "No branch selected",
    };
  }

  if (hasLocalChanges) {
    return {
      branch,
      description: "Commit the current worktree changes before pushing or opening a pull request.",
      kind: "needs_commit",
      pullRequest,
      title: "Commit your changes first",
    };
  }

  if (!gitStatus?.upstream) {
    return {
      branch,
      description: `Push ${branch} to create its remote branch before opening a pull request.`,
      kind: "needs_push",
      pullRequest,
      title: "Create the remote branch",
    };
  }

  if ((gitStatus.ahead ?? 0) > 0) {
    const commitCount = gitStatus.ahead;
    return {
      branch,
      description: `Push ${commitCount} local ${commitCount === 1 ? "commit" : "commits"} to update the remote branch.`,
      kind: "needs_push",
      pullRequest,
      title: "Push the latest commits",
    };
  }

  if (!support?.available) {
    return {
      branch,
      description:
        support?.message ??
        "Pull request actions are not available for this workspace yet.",
      kind: "remote_unavailable",
      pullRequest,
      title: "Pull request provider unavailable",
    };
  }

  if (!pullRequest) {
    const baseRef = branchPullRequest?.suggestedBaseRef ?? "the default branch";
    return {
      branch,
      description: `${branch} is pushed and ready to open a pull request into ${baseRef}.`,
      kind: "ready_to_create",
      pullRequest: null,
      title: "Create a pull request",
    };
  }

  if (!pullRequest.isDraft && pullRequest.mergeable === "mergeable") {
    return {
      branch,
      description: `PR #${pullRequest.number} is open and currently mergeable.`,
      kind: "ready_to_merge",
      pullRequest,
      title: "Ready to merge",
    };
  }

  return {
    branch,
    description: `PR #${pullRequest.number} is open for ${branch}. Review it before merging.`,
    kind: "view_pull_request",
    pullRequest,
    title: `PR #${pullRequest.number} is open`,
  };
}

export function buildGitPullRequestPrimaryAction(
  gitStatus: GitStatusResult | null,
  branchPullRequest: GitBranchPullRequestResult | null,
): GitPullRequestPrimaryAction {
  const state = buildGitPullRequestQuickState(gitStatus, branchPullRequest);
  const canPushAfterCommit = Boolean(gitStatus?.branch) && Boolean(
    gitStatus?.upstream || branchPullRequest?.support.available,
  );

  switch (state.kind) {
    case "needs_commit":
      return {
        kind: canPushAfterCommit ? "commit_and_push" : "commit",
        label: canPushAfterCommit ? "Commit & Push" : "Commit",
      };
    case "needs_push":
      return {
        kind: "push",
        label: "Push Branch",
      };
    case "ready_to_create":
      return {
        kind: "create_pull_request",
        label: "Create PR",
      };
    case "ready_to_merge":
      return {
        kind: "merge_pull_request",
        label: "Merge PR",
      };
    case "view_pull_request":
      return {
        kind: "open_pull_request",
        label: "Open PR",
      };
    default:
      return {
        kind: "disabled",
        label: "Git Status",
      };
  }
}
