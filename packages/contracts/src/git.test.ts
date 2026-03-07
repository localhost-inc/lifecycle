import { describe, expect, test } from "bun:test";

import type {
  GitCommitDiffResult,
  GitCommitResult,
  GitDiffResult,
  GitDiffScope,
  GitFileChangeKind,
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
});
