import { describe, expect, test } from "bun:test";
import type { GitPullRequestListResult } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PullRequestsTab } from "./pull-requests-tab";

function renderPullRequestsTab(props: Partial<Parameters<typeof PullRequestsTab>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(PullRequestsTab, {
        currentBranchPullRequestNumber: null,
        error: null,
        isLoading: false,
        onOpenPullRequest: () => {},
        result: null,
        ...props,
      }),
      storageKey: "test.theme",
    }),
  );
}

describe("PullRequestsTab", () => {
  test("renders repository pull requests with current-branch context", () => {
    const result: GitPullRequestListResult = {
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
          checks: null,
          createdAt: "2026-03-09T10:00:00.000Z",
          headRefName: "feature/git-panel-prs",
          isDraft: true,
          mergeStateStatus: "CLEAN",
          mergeable: "mergeable",
          number: 42,
          reviewDecision: "approved",
          state: "open",
          title: "feat: add pull request rail",
          updatedAt: "2026-03-09T11:00:00.000Z",
          url: "https://github.com/example/repo/pull/42",
        },
      ],
    };

    const markup = renderPullRequestsTab({
      currentBranchPullRequestNumber: 42,
      result,
    });

    expect(markup).toContain("feat: add pull request rail");
    expect(markup).toContain("Draft");
    expect(markup).toContain("Current");
    expect(markup).toContain("feature/git-panel-prs");
    expect(markup).toContain("Mergeable");
    expect(markup).toContain("Approved");
    expect(markup).toContain("Open");
  });

  test("renders provider-unavailable state for unsupported modes", () => {
    const markup = renderPullRequestsTab({
      result: {
        support: {
          available: false,
          message: "Pull requests will come from the cloud provider later.",
          provider: null,
          reason: "mode_not_supported",
        },
        pullRequests: [],
      },
    });

    expect(markup).toContain("Pull requests unavailable");
    expect(markup).toContain("Pull requests will come from the cloud provider later.");
  });
});
