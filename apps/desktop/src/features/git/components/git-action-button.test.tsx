import { describe, expect, test } from "bun:test";
import type { GitBranchPullRequestResult, GitStatusResult } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GitActionButton,
  GitActionMenuContent,
  performShowChangesAction,
} from "@/features/git/components/git-action-button";

function renderGitActionButton(props: Partial<Parameters<typeof GitActionButton>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(GitActionButton, {
        actionError: null,
        branchPullRequest: null,
        defaultOpen: true,
        gitStatus: null,
        isCommitting: false,
        isCreatingPullRequest: false,
        isLoading: false,
        isMergingPullRequest: false,
        isPushingBranch: false,
        onCommit: async () => {},
        onCreatePullRequest: async () => {},
        onMergePullRequest: async () => {},
        onOpenPullRequest: () => {},
        onPushBranch: async () => {},
        onShowChanges: () => {},
        ...props,
      }),
      storageKey: "test.theme",
    }),
  );
}

function renderGitActionMenuContent(
  props: Partial<Parameters<typeof GitActionMenuContent>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(GitActionMenuContent, {
        actionError: null,
        branchPullRequest: null,
        commitMessage: "",
        gitStatus: null,
        isCommitting: false,
        isCreatingPullRequest: false,
        isLoading: false,
        isMergingPullRequest: false,
        isPushingBranch: false,
        onCommit: async () => {},
        onCommitMessageChange: () => {},
        onCreatePullRequest: async () => {},
        onMergePullRequest: async () => {},
        onOpenPullRequest: () => {},
        onPushBranch: async () => {},
        onShowChanges: () => {},
        ...props,
      }),
      storageKey: "test.theme",
    }),
  );
}

describe("GitActionButton", () => {
  test("closes the menu before opening changes", () => {
    const calls: Array<{ kind: "menu"; open: boolean } | { kind: "show-changes" }> = [];

    performShowChangesAction(
      (open) => {
        calls.push({ kind: "menu", open });
      },
      () => {
        calls.push({ kind: "show-changes" });
      },
    );

    expect(calls).toEqual([{ kind: "menu", open: false }, { kind: "show-changes" }]);
  });

  test("keeps the semantic action label while loading", () => {
    const markup = renderGitActionButton({
      isLoading: true,
    });

    expect(markup).toContain("Git Status");
    expect(markup).not.toContain("Loading...");
  });

  test("shows a staging workflow when the branch only has unstaged changes", () => {
    const gitStatus: GitStatusResult = {
      ahead: 0,
      behind: 0,
      branch: "feature/git-panel-prs",
      files: [
        {
          indexStatus: null,
          path: "src/app.tsx",
          staged: false,
          stats: { deletions: 0, insertions: 3 },
          unstaged: true,
          worktreeStatus: "modified",
        },
      ],
      headSha: "0123456789abcdef0123456789abcdef01234567",
      upstream: "origin/feature/git-panel-prs",
    };
    const branchPullRequest: GitBranchPullRequestResult = {
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      branch: "feature/git-panel-prs",
      hasPullRequestChanges: true,
      pullRequest: null,
      suggestedBaseRef: "main",
      upstream: "origin/feature/git-panel-prs",
    };

    const markup = renderGitActionMenuContent({
      branchPullRequest,
      gitStatus,
    });

    expect(renderGitActionButton({ branchPullRequest, gitStatus })).toContain("Stage Changes");
    expect(markup).toContain("Open changes");
    expect(markup).not.toContain("Commit message");
  });

  test("shows a commit workflow when the branch has staged changes", () => {
    const gitStatus: GitStatusResult = {
      ahead: 0,
      behind: 0,
      branch: "feature/git-panel-prs",
      files: [
        {
          indexStatus: "modified",
          path: "src/app.tsx",
          staged: true,
          stats: { deletions: 0, insertions: 3 },
          unstaged: false,
          worktreeStatus: null,
        },
      ],
      headSha: "0123456789abcdef0123456789abcdef01234567",
      upstream: "origin/feature/git-panel-prs",
    };
    const branchPullRequest: GitBranchPullRequestResult = {
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      branch: "feature/git-panel-prs",
      hasPullRequestChanges: true,
      pullRequest: null,
      suggestedBaseRef: "main",
      upstream: "origin/feature/git-panel-prs",
    };

    const markup = renderGitActionMenuContent({
      branchPullRequest,
      gitStatus,
    });

    expect(renderGitActionButton({ branchPullRequest, gitStatus })).toContain("Commit &amp; Push");
    expect(markup).toContain("Commit message");
    expect(markup).toContain("Review changes");
  });

  test("hides commit-and-push when the branch must be synced first", () => {
    const gitStatus: GitStatusResult = {
      ahead: 0,
      behind: 2,
      branch: "feature/git-panel-prs",
      files: [
        {
          indexStatus: "modified",
          path: "src/app.tsx",
          staged: true,
          stats: { deletions: 0, insertions: 3 },
          unstaged: false,
          worktreeStatus: null,
        },
      ],
      headSha: "0123456789abcdef0123456789abcdef01234567",
      upstream: "origin/feature/git-panel-prs",
    };
    const branchPullRequest: GitBranchPullRequestResult = {
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      branch: "feature/git-panel-prs",
      hasPullRequestChanges: true,
      pullRequest: null,
      suggestedBaseRef: "main",
      upstream: "origin/feature/git-panel-prs",
    };

    const markup = renderGitActionMenuContent({
      branchPullRequest,
      gitStatus,
    });

    expect(renderGitActionButton({ branchPullRequest, gitStatus })).toContain(">Commit<");
    expect(markup).toContain("Commit message");
    expect(markup).not.toContain("Commit &amp; Push");
    expect(markup).toContain("Pull the latest remote commits");
  });

  test("shows PR checks when the current branch pull request has them", () => {
    const gitStatus: GitStatusResult = {
      ahead: 0,
      behind: 0,
      branch: "feature/git-panel-prs",
      files: [],
      headSha: "0123456789abcdef0123456789abcdef01234567",
      upstream: "origin/feature/git-panel-prs",
    };
    const branchPullRequest: GitBranchPullRequestResult = {
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      branch: "feature/git-panel-prs",
      hasPullRequestChanges: true,
      pullRequest: {
        author: "kyle",
        baseRefName: "main",
        checks: [
          {
            detailsUrl: "https://github.com/example/repo/actions/runs/42",
            name: "lint",
            status: "success",
            workflowName: "CI",
          },
          {
            detailsUrl: "https://github.com/example/repo/actions/runs/84",
            name: "integration",
            status: "pending",
            workflowName: "CI",
          },
        ],
        createdAt: "2026-03-09T10:00:00.000Z",
        headRefName: "feature/git-panel-prs",
        isDraft: false,
        mergeStateStatus: "CLEAN",
        mergeable: "mergeable",
        number: 42,
        reviewDecision: "approved",
        state: "open",
        title: "feat: add pull request rail",
        updatedAt: "2026-03-09T11:00:00.000Z",
        url: "https://github.com/example/repo/pull/42",
      },
      suggestedBaseRef: "main",
      upstream: "origin/feature/git-panel-prs",
    };

    const markup = renderGitActionMenuContent({
      branchPullRequest,
      gitStatus,
    });

    expect(renderGitActionButton({ branchPullRequest, gitStatus })).toContain("Merge PR");
    expect(markup).toContain("Merge PR");
    expect(markup).toContain("Checks");
    expect(markup).toContain("lint");
    expect(markup).toContain("integration");
    expect(markup).toContain("Passing");
    expect(markup).toContain("Running");
  });

  test("surfaces unsupported provider state without local git assumptions", () => {
    const branchPullRequest: GitBranchPullRequestResult = {
      support: {
        available: false,
        message: "Pull request state will come from the cloud provider later.",
        provider: null,
        reason: "mode_not_supported",
      },
      branch: null,
      hasPullRequestChanges: null,
      pullRequest: null,
      suggestedBaseRef: null,
      upstream: null,
    };

    const markup = renderGitActionMenuContent({
      branchPullRequest,
      gitStatus: null,
    });

    expect(renderGitActionButton({ branchPullRequest, gitStatus: null })).toContain("Git Status");
    expect(markup).toContain("Pull request provider unavailable");
    expect(markup).toContain("Pull request state will come from the cloud provider later.");
  });

  test("surfaces sync guidance when the clean branch is behind its upstream", () => {
    const gitStatus: GitStatusResult = {
      ahead: 0,
      behind: 1,
      branch: "feature/git-panel-prs",
      files: [],
      headSha: "0123456789abcdef0123456789abcdef01234567",
      upstream: "origin/feature/git-panel-prs",
    };
    const branchPullRequest: GitBranchPullRequestResult = {
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      branch: "feature/git-panel-prs",
      hasPullRequestChanges: true,
      pullRequest: null,
      suggestedBaseRef: "main",
      upstream: "origin/feature/git-panel-prs",
    };

    const markup = renderGitActionMenuContent({
      branchPullRequest,
      gitStatus,
    });

    expect(renderGitActionButton({ branchPullRequest, gitStatus })).toContain("Sync Branch");
    expect(markup).toContain("Pull the latest remote commits");
    expect(markup).toContain("Use a terminal session to sync the branch");
  });

  test("suppresses create-pr when the branch matches its base", () => {
    const gitStatus: GitStatusResult = {
      ahead: 0,
      behind: 0,
      branch: "feature/git-panel-prs",
      files: [],
      headSha: "0123456789abcdef0123456789abcdef01234567",
      upstream: "origin/feature/git-panel-prs",
    };
    const branchPullRequest: GitBranchPullRequestResult = {
      support: {
        available: true,
        message: null,
        provider: "github",
        reason: null,
      },
      branch: "feature/git-panel-prs",
      hasPullRequestChanges: false,
      pullRequest: null,
      suggestedBaseRef: "main",
      upstream: "origin/feature/git-panel-prs",
    };

    const markup = renderGitActionMenuContent({
      branchPullRequest,
      gitStatus,
    });

    expect(renderGitActionButton({ branchPullRequest, gitStatus })).toContain("No PR Changes");
    expect(markup).toContain("No pull request changes");
    expect(markup).toContain("matches main");
    expect(markup).not.toContain("Create PR");
  });
});
