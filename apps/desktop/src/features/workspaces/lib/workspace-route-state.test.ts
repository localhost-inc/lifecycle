import { describe, expect, test } from "bun:test";
import type { GitPullRequestSummary } from "@lifecycle/contracts";
import {
  readWorkspaceRouteState,
  resolveWorkspaceRoutePullRequest,
  updateWorkspaceRouteState,
} from "./workspace-route-state";

const availableSupport = {
  available: true,
  message: null,
  provider: "github" as const,
  reason: null,
};

function createPullRequestSummary(
  overrides: Partial<GitPullRequestSummary> = {},
): GitPullRequestSummary {
  return {
    author: "kyle",
    baseRefName: "main",
    checks: null,
    createdAt: "2026-03-12T09:00:00.000Z",
    headRefName: "feature/router-pr-state",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    mergeable: "mergeable",
    number: 42,
    reviewDecision: "approved",
    state: "open",
    title: "feat: persist PR focus in router state",
    updatedAt: "2026-03-12T10:00:00.000Z",
    url: "https://github.com/example/repo/pull/42",
    ...overrides,
  };
}

describe("workspace route state", () => {
  test("defaults to the changes tab when query params are absent or invalid", () => {
    expect(readWorkspaceRouteState(new URLSearchParams())).toEqual({
      gitTab: "changes",
      pullRequestNumber: null,
    });

    expect(
      readWorkspaceRouteState(new URLSearchParams("git=unknown&pr=not-a-number")),
    ).toEqual({
      gitTab: "changes",
      pullRequestNumber: null,
    });
  });

  test("reads git tab and pull request state from search params", () => {
    expect(readWorkspaceRouteState(new URLSearchParams("git=pull-requests&pr=42"))).toEqual({
      gitTab: "pull-requests",
      pullRequestNumber: 42,
    });
  });

  test("updates workspace route search params without dropping unrelated keys", () => {
    const next = updateWorkspaceRouteState(new URLSearchParams("project=project_1"), {
      gitTab: "history",
      pullRequestNumber: 42,
    });

    expect(next.toString()).toBe("project=project_1&git=history&pr=42");
    expect(
      updateWorkspaceRouteState(next, {
        gitTab: "changes",
        pullRequestNumber: null,
      }).toString(),
    ).toBe("project=project_1");
  });

  test("prefers detail pull request data, then current branch, then repository list", () => {
    const detailPullRequest = createPullRequestSummary({ number: 42, title: "Detail" });
    const currentPullRequest = createPullRequestSummary({ number: 42, title: "Current" });
    const listPullRequest = createPullRequestSummary({ number: 42, title: "List" });

    expect(
      resolveWorkspaceRoutePullRequest({
        currentPullRequestResult: {
          branch: "feature/router-pr-state",
          pullRequest: currentPullRequest,
          suggestedBaseRef: "main",
          support: availableSupport,
          upstream: "origin/feature/router-pr-state",
        },
        detailPullRequestResult: {
          pullRequest: detailPullRequest,
          support: availableSupport,
        },
        listPullRequestsResult: {
          pullRequests: [listPullRequest],
          support: availableSupport,
        },
        pullRequestNumber: 42,
      }),
    ).toEqual(detailPullRequest);

    expect(
      resolveWorkspaceRoutePullRequest({
        currentPullRequestResult: {
          branch: "feature/router-pr-state",
          pullRequest: currentPullRequest,
          suggestedBaseRef: "main",
          support: availableSupport,
          upstream: "origin/feature/router-pr-state",
        },
        detailPullRequestResult: {
          pullRequest: createPullRequestSummary({ number: 7, title: "Other detail" }),
          support: availableSupport,
        },
        listPullRequestsResult: {
          pullRequests: [listPullRequest],
          support: availableSupport,
        },
        pullRequestNumber: 42,
      }),
    ).toEqual(currentPullRequest);

    expect(
      resolveWorkspaceRoutePullRequest({
        currentPullRequestResult: {
          branch: "feature/router-pr-state",
          pullRequest: createPullRequestSummary({ number: 7, title: "Other current" }),
          suggestedBaseRef: "main",
          support: availableSupport,
          upstream: "origin/feature/router-pr-state",
        },
        listPullRequestsResult: {
          pullRequests: [listPullRequest],
          support: availableSupport,
        },
        pullRequestNumber: 42,
      }),
    ).toEqual(listPullRequest);
  });
});
