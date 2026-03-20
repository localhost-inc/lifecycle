import { describe, expect, test } from "bun:test";
import {
  COPYABLE_GIT_DIFF_CSS,
  getOpenableDiffFilePath,
  withCopyableGitDiffOptions,
} from "@/features/git/components/git-diff-rendering";

describe("withCopyableGitDiffOptions", () => {
  test("injects copyable text CSS for diff renderers", () => {
    expect(withCopyableGitDiffOptions({ themeType: "light" })).toEqual({
      themeType: "light",
      unsafeCSS: COPYABLE_GIT_DIFF_CSS,
    });
  });

  test("preserves existing unsafe CSS", () => {
    expect(
      withCopyableGitDiffOptions({
        themeType: "dark",
        unsafeCSS: "[data-diffs] { color: red; }",
      }),
    ).toEqual({
      themeType: "dark",
      unsafeCSS: `[data-diffs] { color: red; }\n${COPYABLE_GIT_DIFF_CSS}`,
    });
  });
});

describe("getOpenableDiffFilePath", () => {
  test("returns null for deleted files", () => {
    expect(
      getOpenableDiffFilePath({
        hunks: [],
        name: "deleted.txt",
        prevName: undefined,
        splitLineCount: 0,
        type: "deleted",
        unifiedLineCount: 0,
      }),
    ).toBeNull();
  });
});
