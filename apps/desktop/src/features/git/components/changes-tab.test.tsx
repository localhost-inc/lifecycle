import { describe, expect, test } from "bun:test";
import type { GitStatusResult } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangesTab } from "./changes-tab";

function renderChangesTab({
  error = null,
  gitStatus = null,
  isLoading = false,
}: {
  error?: unknown;
  gitStatus?: GitStatusResult | null;
  isLoading?: boolean;
} = {}) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(ChangesTab, {
        error,
        gitStatus,
        isLoading,
        onOpenDiff: () => {},
        onOpenFile: () => {},
        onRefresh: async () => {},
        workspaceId: "workspace_1",
      }),
      storageKey: "test.theme",
    }),
  );
}

describe("ChangesTab", () => {
  test("renders working and staged sections with staging actions", () => {
    const markup = renderChangesTab({
      gitStatus: {
        ahead: 0,
        behind: 0,
        branch: "main",
        files: [
          {
            indexStatus: "modified",
            originalPath: null,
            path: "src/app.tsx",
            staged: true,
            stats: {
              deletions: 1,
              insertions: 3,
            },
            unstaged: true,
            worktreeStatus: "modified",
          },
          {
            indexStatus: "added",
            originalPath: null,
            path: "README.md",
            staged: true,
            stats: {
              deletions: 0,
              insertions: 12,
            },
            unstaged: false,
            worktreeStatus: null,
          },
        ],
        headSha: "0123456789abcdef0123456789abcdef01234567",
        upstream: "origin/main",
      },
    });

    expect(markup).toContain("Working");
    expect(markup).toContain("Staged");
    expect(markup).toContain("app.tsx");
    expect(markup).toContain("README.md");
    expect(markup).toContain("Stage all");
    expect(markup).toContain("Unstage all");
    expect(markup).toContain('aria-label="Open src/app.tsx"');
    expect(markup).toContain('aria-label="Open README.md"');
    expect(markup).toContain('aria-label="Stage src/app.tsx"');
    expect(markup).toContain('aria-label="Unstage src/app.tsx"');
    expect(markup).not.toContain("Staged Changes");
    expect(markup).not.toContain("divide-y");
  });

  test("renders the animated lifecycle logo while changes load", () => {
    const markup = renderChangesTab({ isLoading: true });

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading changes...");
    expect(markup).toContain('data-slot="logo"');
    expect(markup).toContain('data-lifecycle-logo-path="left"');
    expect(markup).toContain("animation-iteration-count:infinite");
    expect(markup).toContain("text-[var(--muted-foreground)]");
  });

  test("does not render the lifecycle logo for a clean working tree", () => {
    const markup = renderChangesTab({
      gitStatus: {
        ahead: 0,
        behind: 0,
        branch: "main",
        files: [],
        headSha: "0123456789abcdef0123456789abcdef01234567",
        upstream: "origin/main",
      },
    });

    expect(markup).toContain("Working tree clean");
    expect(markup).toContain("New edits will appear here.");
    expect(markup).not.toContain('data-slot="logo"');
  });
});
