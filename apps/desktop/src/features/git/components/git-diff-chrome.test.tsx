import { describe, expect, test } from "bun:test";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiffFileTree } from "./diff-file-tree";
import { GitFileHeader } from "./git-file-header";

function makeFile(name: string, additions: number = 0, deletions: number = 0): FileDiffMetadata {
  return {
    name,
    prevName: undefined,
    type: "change",
    hunks: [
      {
        collapsedBefore: 0,
        splitLineStart: 0,
        splitLineCount: 0,
        unifiedLineStart: 0,
        unifiedLineCount: 0,
        additionCount: 0,
        additionStart: 0,
        additionLines: additions,
        deletionCount: 0,
        deletionStart: 0,
        deletionLines: deletions,
        hunkContent: [],
        hunkContext: undefined,
        hunkSpecs: undefined,
      },
    ],
    splitLineCount: 0,
    unifiedLineCount: 0,
  };
}

describe("git diff chrome theming", () => {
  test("renders the file tree on the project canvas background", () => {
    const markup = renderToStaticMarkup(
      createElement(DiffFileTree, {
        activeFilePath: null,
        files: [makeFile("apps/desktop/src/main.tsx", 12, 4)],
        onSelectFile: () => {},
        totalAdditions: 12,
        totalDeletions: 4,
      }),
    );

    expect(markup).toContain(
      'class="flex h-full w-full flex-col overflow-hidden bg-[var(--background)]"',
    );
    expect(markup).not.toContain("bg-[var(--panel)]");
  });

  test("renders sticky diff headers on the project canvas background", () => {
    const markup = renderToStaticMarkup(
      createElement(GitFileHeader, {
        collapsed: false,
        fileDiff: makeFile("apps/desktop/src/main.tsx", 12, 4),
        onOpenFile: null,
        onToggleCollapse: () => {},
        sticky: true,
      }),
    );

    expect(markup).toContain("sticky top-0 z-10 bg-[var(--background)] border-b border-[var(--border)]");
    expect(markup).not.toContain("bg-[var(--panel)]");
  });
});
