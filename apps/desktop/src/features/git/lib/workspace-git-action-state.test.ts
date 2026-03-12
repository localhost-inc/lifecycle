import { describe, expect, test } from "bun:test";
import type { GitBranchPullRequestResult, GitStatusResult } from "@lifecycle/contracts";
import { buildWorkspaceGitActionState } from "./workspace-git-action-state";

const baseStatus: GitStatusResult = {
  ahead: 0,
  behind: 0,
  branch: "feature/git-prs",
  files: [],
  headSha: "abcdef1234567890",
  upstream: "origin/feature/git-prs",
};

const baseBranchPullRequest: GitBranchPullRequestResult = {
  support: {
    available: true,
    message: null,
    provider: "github",
    reason: null,
  },
  branch: "feature/git-prs",
  hasPullRequestChanges: true,
  pullRequest: null,
  suggestedBaseRef: "main",
  upstream: "origin/feature/git-prs",
};

describe("buildWorkspaceGitActionState", () => {
  test("requires staging before commit actions when only working tree changes exist", () => {
    const state = buildWorkspaceGitActionState(
      {
        ...baseStatus,
        files: [
          {
            indexStatus: null,
            path: "src/app.tsx",
            staged: false,
            stats: { deletions: 0, insertions: 1 },
            unstaged: true,
            worktreeStatus: "modified",
          },
        ],
      },
      baseBranchPullRequest,
    );

    expect(state.kind).toBe("needs_stage");
    expect(state.title).toContain("Stage");
    expect(state.primaryAction.label).toBe("Stage Changes");
  });

  test("requires a push when the branch has no upstream yet", () => {
    const state = buildWorkspaceGitActionState(
      {
        ...baseStatus,
        upstream: null,
      },
      {
        ...baseBranchPullRequest,
        upstream: null,
      },
    );

    expect(state.kind).toBe("needs_push");
    expect(state.title).toContain("remote branch");
    expect(state.syncKind).toBe("unpublished");
  });

  test("blocks pull request actions when the branch is behind its upstream", () => {
    const state = buildWorkspaceGitActionState(
      {
        ...baseStatus,
        behind: 2,
      },
      baseBranchPullRequest,
    );

    expect(state.kind).toBe("blocked_behind");
    expect(state.primaryAction.kind).toBe("disabled");
    expect(state.primaryAction.label).toBe("Sync Branch");
  });

  test("blocks push-after-commit when the branch has diverged", () => {
    const state = buildWorkspaceGitActionState(
      {
        ...baseStatus,
        ahead: 1,
        behind: 1,
        files: [
          {
            indexStatus: "modified",
            path: "src/app.tsx",
            staged: true,
            stats: { deletions: 0, insertions: 1 },
            unstaged: false,
            worktreeStatus: null,
          },
        ],
      },
      baseBranchPullRequest,
    );

    expect(state.kind).toBe("needs_commit");
    expect(state.primaryAction.kind).toBe("commit");
    expect(state.description).toContain("Reconcile the local and remote branch history");
  });

  test("switches to create-pr once the branch is clean and pushed", () => {
    const state = buildWorkspaceGitActionState(baseStatus, baseBranchPullRequest);

    expect(state.kind).toBe("ready_to_create_pull_request");
    expect(state.description).toContain("main");
    expect(state.primaryAction.label).toBe("Create PR");
  });

  test("suppresses create-pr when the branch has no committed diff against base", () => {
    const state = buildWorkspaceGitActionState(baseStatus, {
      ...baseBranchPullRequest,
      hasPullRequestChanges: false,
    });

    expect(state.kind).toBe("no_pull_request_changes");
    expect(state.description).toContain("matches main");
    expect(state.primaryAction.label).toBe("No PR Changes");
  });

  test("prefers merge when the current branch pull request is mergeable", () => {
    const state = buildWorkspaceGitActionState(baseStatus, {
      ...baseBranchPullRequest,
      pullRequest: {
        author: "kyle",
        baseRefName: "main",
        createdAt: "2026-03-09T10:00:00.000Z",
        headRefName: "feature/git-prs",
        isDraft: false,
        mergeStateStatus: "CLEAN",
        mergeable: "mergeable",
        number: 42,
        reviewDecision: "approved",
        checks: null,
        state: "open",
        title: "feat: add git panel PR rail",
        updatedAt: "2026-03-09T10:30:00.000Z",
        url: "https://github.com/example/repo/pull/42",
      },
    });

    expect(state.kind).toBe("ready_to_merge");
    expect(state.pullRequest?.number).toBe(42);
    expect(state.primaryAction.label).toBe("Merge PR");
  });

  test("stays in a loading state while current-branch pull request data is pending", () => {
    const state = buildWorkspaceGitActionState(baseStatus, null, {
      isLoading: true,
    });

    expect(state.kind).toBe("loading");
    expect(state.primaryAction.label).toBe("Git Status");
    expect(state.description).toContain("pull request state");
  });
});
