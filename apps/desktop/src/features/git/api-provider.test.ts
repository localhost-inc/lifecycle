import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceClient } from "@lifecycle/workspace";
import {
  getGitBaseRef,
  getGitChangesPatch,
  getGitCommitPatch,
  getGitDiff,
  getGitPullRequest,
  getGitPullRequestPatch,
  getGitRefDiffPatch,
  getGitScopePatch,
  getGitStatus,
} from "@/features/git/api";

const client = {
  getGitStatus: mock(async () => ({
    branch: "feature/runtime-boundary",
    headSha: "abcdef1234567890",
    upstream: "origin/feature/runtime-boundary",
    ahead: 1,
    behind: 0,
    files: [],
  })),
  getGitScopePatch: mock(async () => "scope patch"),
  getGitChangesPatch: mock(async () => "changes patch"),
  getGitDiff: mock(async () => ({
    scope: "working" as const,
    filePath: "src/app.ts",
    patch: "diff patch",
    isBinary: false,
  })),
  listGitLog: mock(async () => []),
  listGitPullRequests: mock(async () => ({
    support: {
      available: true,
      message: null,
      provider: "github",
      reason: null,
    },
    pullRequests: [],
  })),
  getGitPullRequest: mock(async () => ({
    support: {
      available: true,
      message: null,
      provider: "github",
      reason: null,
    },
    pullRequest: null,
  })),
  getCurrentGitPullRequest: mock(async () => ({
    support: {
      available: true,
      message: null,
      provider: "github",
      reason: null,
    },
    branch: "feature/runtime-boundary",
    hasPullRequestChanges: true,
    upstream: "origin/feature/runtime-boundary",
    suggestedBaseRef: "main",
    pullRequest: null,
  })),
  getGitBaseRef: mock(async () => "main"),
  getGitRefDiffPatch: mock(async () => "ref diff patch"),
  getGitPullRequestPatch: mock(async () => "pr patch"),
  getGitCommitPatch: mock(async () => ({
    sha: "abcdef1234567890",
    patch: "commit patch",
  })),
  stageGitFiles: mock(async () => {}),
  unstageGitFiles: mock(async () => {}),
  commitGit: mock(async () => ({
    sha: "abcdef1234567890",
    shortSha: "abcdef12",
    message: "feat: runtime boundary",
  })),
  pushGit: mock(async () => ({
    branch: "feature/runtime-boundary",
    remote: "origin",
    ahead: 0,
    behind: 0,
  })),
  createGitPullRequest: mock(async () => ({
    author: "kyle",
    baseRefName: "main",
    createdAt: "2026-03-13T00:00:00.000Z",
    headRefName: "feature/runtime-boundary",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    mergeable: "mergeable",
    number: 42,
    reviewDecision: "approved",
    checks: null,
    state: "open",
    title: "feat: runtime boundary",
    updatedAt: "2026-03-13T00:00:00.000Z",
    url: "https://github.com/example/repo/pull/42",
  })),
  mergeGitPullRequest: mock(async () => ({
    author: "kyle",
    baseRefName: "main",
    createdAt: "2026-03-13T00:00:00.000Z",
    headRefName: "feature/runtime-boundary",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    mergeable: "mergeable",
    number: 42,
    reviewDecision: "approved",
    checks: null,
    state: "merged",
    title: "feat: runtime boundary",
    updatedAt: "2026-03-13T00:00:00.000Z",
    url: "https://github.com/example/repo/pull/42",
  })),
} as unknown as WorkspaceClient;

describe("git api workspace routing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    for (const method of Object.values(client)) {
      if (typeof method === "function" && "mockClear" in method) {
        (method as ReturnType<typeof mock>).mockClear();
      }
    }
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes advanced workspace-scoped git reads through the runtime", async () => {
    expect(await getGitStatus(client, "ws_1")).toEqual({
      branch: "feature/runtime-boundary",
      headSha: "abcdef1234567890",
      upstream: "origin/feature/runtime-boundary",
      ahead: 1,
      behind: 0,
      files: [],
    });
    expect(await getGitScopePatch(client, "ws_1", "working")).toBe("scope patch");
    expect(await getGitChangesPatch(client, "ws_1")).toBe("changes patch");
    expect(await getGitDiff(client, "ws_1", "src/app.ts", "working")).toEqual({
      scope: "working",
      filePath: "src/app.ts",
      patch: "diff patch",
      isBinary: false,
    });
    expect(await getGitPullRequest(client, "ws_1", 42)).toEqual({
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      pullRequest: null,
    });
    expect(await getGitBaseRef(client, "ws_1")).toBe("main");
    expect(await getGitRefDiffPatch(client, "ws_1", "main", "HEAD")).toBe("ref diff patch");
    expect(await getGitPullRequestPatch(client, "ws_1", 42)).toBe("pr patch");
    expect(await getGitCommitPatch(client, "ws_1", "abcdef1234567890")).toEqual({
      sha: "abcdef1234567890",
      patch: "commit patch",
    });

    expect(
      (client.getGitStatus as ReturnType<typeof mock>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
  });
});
