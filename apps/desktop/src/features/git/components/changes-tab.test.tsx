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
      }),
      storageKey: "test.theme",
    }),
  );
}

describe("ChangesTab", () => {
  test("renders a single changes list without staging actions", () => {
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

    expect(markup).toContain("app.tsx");
    expect(markup).toContain("README.md");
    expect(markup).not.toContain("Stage All");
    expect(markup).not.toContain("Unstage All");
    expect(markup).not.toContain("Stage file");
    expect(markup).not.toContain("Unstage file");
    expect(markup).not.toContain("Staged Changes");
  });
});
