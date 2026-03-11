import { describe, expect, test } from "bun:test";

import type {
  GitBranchPullRequestResult,
  GitCommitDiffResult,
  GitCommitResult,
  GitDiffResult,
  GitDiffScope,
  GitFileChangeKind,
  GitPullRequestDetailResult,
  GitPullRequestListResult,
  GitStatusResult,
} from "./git";

describe("git contracts", () => {
  test("keeps canonical diff scopes", () => {
    const scopes: GitDiffScope[] = ["working", "staged", "branch"];

    expect(scopes).toEqual(["working", "staged", "branch"]);
  });

  test("keeps canonical change kinds", () => {
    const kinds: GitFileChangeKind[] = [
      "modified",
      "added",
      "deleted",
      "renamed",
      "copied",
      "unmerged",
      "untracked",
      "ignored",
      "type_changed",
    ];

    expect(kinds).toContain("renamed");
    expect(kinds).toContain("untracked");
  });

  test("supports split index and worktree status", () => {
    const status: GitStatusResult = {
      branch: "feature/version-control",
      headSha: "abcdef1234567890",
      upstream: "origin/feature/version-control",
      ahead: 2,
      behind: 1,
      files: [
        {
          path: "src/app.ts",
          indexStatus: "modified",
          worktreeStatus: "modified",
          staged: true,
          unstaged: true,
          stats: {
            insertions: 12,
            deletions: 4,
          },
        },
      ],
    };

    expect(status.files[0]?.staged).toBeTrue();
    expect(status.files[0]?.unstaged).toBeTrue();
  });

  test("supports diff and commit result payloads", () => {
    const diff: GitDiffResult = {
      scope: "working",
      filePath: "src/app.ts",
      patch: "@@ -1 +1 @@",
      isBinary: false,
    };
    const commitDiff: GitCommitDiffResult = {
      sha: "abcdef1234567890",
      patch: "diff --git a/src/app.ts b/src/app.ts",
    };
    const commit: GitCommitResult = {
      sha: "abcdef1234567890",
      shortSha: "abcdef12",
      message: "feat: add version control panel",
    };

    expect(diff.scope).toBe("working");
    expect(commitDiff.sha).toBe("abcdef1234567890");
    expect(commit.shortSha).toBe("abcdef12");
  });

  test("supports pull request list and current-branch payloads", () => {
    const pullRequests: GitPullRequestListResult = {
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      pullRequests: [
        {
          author: "kyle",
          baseRefName: "main",
          createdAt: "2026-03-09T10:00:00.000Z",
          headRefName: "feature/git-prs",
          isDraft: false,
          mergeStateStatus: "CLEAN",
          mergeable: "mergeable",
          number: 42,
          reviewDecision: "approved",
          checks: [
            {
              detailsUrl: "https://github.com/example/repo/actions/runs/42",
              name: "build",
              status: "success",
              workflowName: "CI",
            },
          ],
          state: "open",
          title: "feat: add git pull request rail",
          updatedAt: "2026-03-09T11:00:00.000Z",
          url: "https://github.com/example/repo/pull/42",
        },
      ],
    };
    const currentBranch: GitBranchPullRequestResult = {
      support: pullRequests.support,
      branch: "feature/git-prs",
      upstream: "origin/feature/git-prs",
      suggestedBaseRef: "main",
      pullRequest: pullRequests.pullRequests[0] ?? null,
    };

    expect(pullRequests.pullRequests[0]?.number).toBe(42);
    expect(currentBranch.pullRequest?.mergeable).toBe("mergeable");
    expect(currentBranch.pullRequest?.checks?.[0]?.status).toBe("success");
    expect(currentBranch.suggestedBaseRef).toBe("main");
  });

  test("supports pull request detail payloads", () => {
    const detail: GitPullRequestDetailResult = {
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      pullRequest: {
        author: "kyle",
        baseRefName: "main",
        checks: [
          {
            detailsUrl: "https://github.com/example/repo/actions/runs/42",
            name: "build",
            status: "success",
            workflowName: "CI",
          },
        ],
        createdAt: "2026-03-09T10:00:00.000Z",
        headRefName: "feature/git-prs",
        isDraft: false,
        mergeStateStatus: "CLEAN",
        mergeable: "mergeable",
        number: 42,
        reviewDecision: "approved",
        state: "open",
        title: "feat: add git pull request rail",
        updatedAt: "2026-03-09T11:00:00.000Z",
        url: "https://github.com/example/repo/pull/42",
      },
    };

    expect(detail.pullRequest?.number).toBe(42);
    expect(detail.pullRequest?.checks?.[0]?.name).toBe("build");
  });
});
