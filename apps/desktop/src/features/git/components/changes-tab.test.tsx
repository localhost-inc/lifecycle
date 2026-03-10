import { describe, expect, test } from "bun:test";
import type { GitStatusResult } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangesTab } from "./changes-tab";

function renderChangesTab(gitStatus: GitStatusResult) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(ChangesTab, {
        error: null,
        gitStatus,
        isLoading: false,
        onOpenDiff: () => {},
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
    });

    expect(markup).toContain("Working");
    expect(markup).toContain("Staged");
    expect(markup).toContain("app.tsx");
    expect(markup).toContain("README.md");
    expect(markup).toContain("Stage all");
    expect(markup).toContain("Unstage all");
    expect(markup).toContain('aria-label="Stage src/app.tsx"');
    expect(markup).toContain('aria-label="Unstage src/app.tsx"');
    expect(markup).not.toContain("Staged Changes");
    expect(markup).not.toContain("divide-y");
  });
});
