import { describe, expect, test } from "bun:test";
import type {
  GitBranchPullRequestResult,
  GitPullRequestDetailResult,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import {
  buildPullRequestDiffReloadKey,
  resolvePullRequestSurfaceState,
} from "./pull-request-surface";

function createPullRequestSummary(
  overrides: Partial<GitPullRequestSummary> = {},
): GitPullRequestSummary {
  return {
    author: "kyle",
    baseRefName: "main",
    checks: null,
    createdAt: "2026-03-10T10:00:00.000Z",
    headRefName: "feature/pr-surface",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    mergeable: "mergeable",
    number: 42,
    reviewDecision: "approved",
    state: "open",
    title: "feat: redesign pull request surface",
    updatedAt: "2026-03-10T11:00:00.000Z",
    url: "https://github.com/example/repo/pull/42",
    ...overrides,
  };
}

function createCurrentPullRequestResult(
  pullRequest: GitPullRequestSummary | null,
): GitBranchPullRequestResult {
  return {
    support: {
      available: true,
      message: null,
      provider: "github",
      reason: null,
    },
    branch: pullRequest?.headRefName ?? "feature/pr-surface",
    pullRequest,
    suggestedBaseRef: "main",
    upstream: "origin/feature/pr-surface",
  };
}

function createPullRequestDetailResult(
  pullRequest: GitPullRequestSummary | null,
  supportMessage: string | null = null,
): GitPullRequestDetailResult {
  return {
    support: {
      available: supportMessage === null,
      message: supportMessage,
      provider: supportMessage === null ? "github" : null,
      reason: supportMessage === null ? null : "mode_not_supported",
    },
    pullRequest,
  };
}

describe("resolvePullRequestSurfaceState", () => {
  test("diff reload key changes when the live pull request timestamp changes", () => {
    const pullRequest = createPullRequestSummary();

    const initialKey = buildPullRequestDiffReloadKey("workspace-1", pullRequest);
    const updatedKey = buildPullRequestDiffReloadKey(
      "workspace-1",
      createPullRequestSummary({
        updatedAt: "2026-03-10T11:05:00.000Z",
      }),
    );

    expect(updatedKey).not.toBe(initialKey);
  });

  test("prefers current-branch detail when the snapshot matches the current branch PR", () => {
    const snapshot = createPullRequestSummary({
      checks: null,
    });
    const currentPullRequest = createPullRequestSummary({
      checks: [
        {
          detailsUrl: "https://github.com/example/repo/actions/runs/42",
          name: "CI",
          status: "success",
          workflowName: "ci",
        },
      ],
    });

    const result = resolvePullRequestSurfaceState({
      currentLoading: false,
      currentPullRequestResult: createCurrentPullRequestResult(currentPullRequest),
      detailLoading: false,
      detailResult: createPullRequestDetailResult(null),
      snapshot,
    });

    expect(result.pullRequest.checks?.[0]?.name).toBe("CI");
    expect(result.currentBranchPullRequestNumber).toBe(42);
    expect(result.snapshotMessage).toBeNull();
  });

  test("uses arbitrary pull request detail for non-current pull requests", () => {
    const snapshot = createPullRequestSummary({
      checks: null,
      number: 77,
      title: "fix: restore pull request checks",
      url: "https://github.com/example/repo/pull/77",
    });
    const detailPullRequest = createPullRequestSummary({
      checks: [
        {
          detailsUrl: "https://github.com/example/repo/actions/runs/77",
          name: "lint",
          status: "pending",
          workflowName: "ci",
        },
      ],
      number: 77,
      title: snapshot.title,
      url: snapshot.url,
    });

    const result = resolvePullRequestSurfaceState({
      currentLoading: false,
      currentPullRequestResult: createCurrentPullRequestResult(createPullRequestSummary()),
      detailLoading: false,
      detailResult: createPullRequestDetailResult(detailPullRequest),
      snapshot,
    });

    expect(result.pullRequest.number).toBe(77);
    expect(result.pullRequest.checks?.[0]?.name).toBe("lint");
    expect(result.currentBranchPullRequestNumber).toBe(42);
    expect(result.snapshotMessage).toBeNull();
  });

  test("keeps the snapshot and explains why when live detail is unavailable", () => {
    const snapshot = createPullRequestSummary({
      checks: null,
      number: 88,
      title: "chore: sync admin labels",
      url: "https://github.com/example/repo/pull/88",
    });

    const result = resolvePullRequestSurfaceState({
      currentLoading: false,
      currentPullRequestResult: createCurrentPullRequestResult(createPullRequestSummary()),
      detailLoading: false,
      detailResult: createPullRequestDetailResult(null, "Pull request detail is unavailable."),
      snapshot,
    });

    expect(result.pullRequest.number).toBe(88);
    expect(result.pullRequest.checks).toBeNull();
    expect(result.snapshotMessage).toContain("Showing the last known snapshot for PR #88.");
    expect(result.snapshotMessage).toContain("Pull request detail is unavailable.");
  });
});
