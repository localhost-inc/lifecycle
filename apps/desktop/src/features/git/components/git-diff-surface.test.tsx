import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { GitStatusResult } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mockStoreContext } from "@/test/store-mock";
import { ReactQueryProvider } from "@/store/react-query-provider";
import { buildChangesPatchReloadKey, GitDiffSurface } from "@/features/git/components/git-diff-surface";

function renderSurface(node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(ReactQueryProvider, {
      children: createElement(ThemeProvider, { children: node, storageKey: "test.theme" }),
    }),
  );
}

function createGitStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    ahead: 0,
    behind: 0,
    branch: "main",
    files: [
      {
        indexStatus: "modified",
        originalPath: null,
        path: "src/app.tsx",
        staged: false,
        stats: {
          deletions: 1,
          insertions: 3,
        },
        unstaged: true,
        worktreeStatus: "modified",
      },
    ],
    headSha: "0123456789abcdef0123456789abcdef01234567",
    upstream: "origin/main",
    ...overrides,
  };
}

describe("GitDiffSurface", () => {
  beforeEach(() => mockStoreContext());
  afterEach(() => mock.restore());

  test("renders changes mode without scope controls while keeping the diff view toggle", () => {
    const markup = renderSurface(
      createElement(GitDiffSurface, {
        source: {
          focusPath: "src/app.tsx",
          mode: "changes",
        },
        workspaceId: "ws-1",
      }),
    );

    expect(markup).not.toContain("Working");
    expect(markup).not.toContain("Staged");
    expect(markup).not.toContain("Branch");
    expect(markup).toContain("Diff view mode");
    expect(markup).toContain("Split");
    expect(markup).toContain("Unified");
    expect(markup).toContain("backdrop-blur-xl");
    expect(markup).toContain('aria-pressed="true"');
  });

  test("renders commit metadata through the shared surface", () => {
    const markup = renderSurface(
      createElement(GitDiffSurface, {
        source: {
          commit: {
            author: "Lifecycle",
            email: "test@example.com",
            message: "feat: unify diff surface",
            sha: "0123456789abcdef0123456789abcdef01234567",
            shortSha: "01234567",
            timestamp: "2026-03-08T12:00:00.000Z",
          },
          mode: "commit",
        },
        workspaceId: "ws-1",
      }),
    );

    expect(markup).toContain("feat: unify diff surface");
    expect(markup).toContain("Lifecycle");
    expect(markup).toContain("01234567");
  });

  test("builds a stable changes reload key for equivalent git status snapshots", () => {
    const status = createGitStatus();
    const equivalentStatus = createGitStatus({
      files: status.files.map((file) => ({
        ...file,
        stats: {
          ...file.stats,
        },
      })),
    });

    expect(buildChangesPatchReloadKey(equivalentStatus)).toBe(buildChangesPatchReloadKey(status));
  });

  test("changes the changes reload key when git status changes", () => {
    const status = createGitStatus();
    const file = status.files[0]!;
    const stagedStatus = createGitStatus({
      files: [
        {
          ...file,
          staged: true,
          unstaged: false,
        },
      ],
    });

    expect(buildChangesPatchReloadKey(stagedStatus)).not.toBe(buildChangesPatchReloadKey(status));
  });
});
