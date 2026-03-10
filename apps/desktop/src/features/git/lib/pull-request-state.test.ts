import { describe, expect, test } from "bun:test";
import type { GitBranchPullRequestResult, GitStatusResult } from "@lifecycle/contracts";
import {
  buildGitPullRequestPrimaryAction,
  buildGitPullRequestQuickState,
} from "./pull-request-state";

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
  pullRequest: null,
  suggestedBaseRef: "main",
  upstream: "origin/feature/git-prs",
};

describe("buildGitPullRequestQuickState", () => {
  test("requires staging before commit actions when only working tree changes exist", () => {
    const state = buildGitPullRequestQuickState(
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
  });

  test("requires a push when the branch has no upstream yet", () => {
    const state = buildGitPullRequestQuickState(
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
  });

  test("switches to create-pr once the branch is clean and pushed", () => {
    const state = buildGitPullRequestQuickState(baseStatus, baseBranchPullRequest);

    expect(state.kind).toBe("ready_to_create");
    expect(state.description).toContain("main");
    expect(buildGitPullRequestPrimaryAction(baseStatus, baseBranchPullRequest).label).toBe(
      "Create PR",
    );
  });

  test("prefers merge when the current branch pull request is mergeable", () => {
    const state = buildGitPullRequestQuickState(baseStatus, {
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
  });

  test("recommends stage changes when nothing is staged yet", () => {
    const action = buildGitPullRequestPrimaryAction(
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

    expect(action.kind).toBe("show_changes");
    expect(action.label).toBe("Stage Changes");
  });

  test("recommends commit and push when staged changes are ready", () => {
    const action = buildGitPullRequestPrimaryAction(
      {
        ...baseStatus,
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

    expect(action.kind).toBe("commit_and_push");
    expect(action.label).toBe("Commit & Push");
  });
});
