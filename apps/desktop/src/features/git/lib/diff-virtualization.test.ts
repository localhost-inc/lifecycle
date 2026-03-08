import { describe, expect, test } from "bun:test";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import {
  buildPatchRenderCacheKey,
  buildDiffSectionLayout,
  estimateDiffBodyHeight,
  estimateDiffSectionHeight,
  findDiffSectionIndexAtOffset,
  getVirtualDiffRange,
} from "./diff-virtualization";

function makeFile(name: string, splitLineCount: number): FileDiffMetadata {
  return {
    name,
    prevName: undefined,
    type: "change",
    hunks: [
      {
        collapsedBefore: 0,
        splitLineStart: 1,
        splitLineCount,
        unifiedLineStart: 1,
        unifiedLineCount: splitLineCount,
        additionCount: 0,
        additionStart: 1,
        additionLines: Math.floor(splitLineCount / 2),
        deletionCount: 0,
        deletionStart: 1,
        deletionLines: Math.floor(splitLineCount / 2),
        hunkContent: [],
        hunkContext: undefined,
        hunkSpecs: undefined,
      },
    ],
    splitLineCount,
    unifiedLineCount: splitLineCount,
  };
}

describe("estimateDiffSectionHeight", () => {
  test("estimates a positive body height", () => {
    const file = makeFile("src/example.ts", 120);

    expect(estimateDiffBodyHeight(file)).toBeGreaterThan(0);
  });

  test("shrinks collapsed sections to the sticky header height", () => {
    const file = makeFile("src/example.ts", 120);

    expect(estimateDiffSectionHeight(file, true)).toBeLessThan(
      estimateDiffSectionHeight(file, false),
    );
  });
});

describe("buildDiffSectionLayout", () => {
  test("uses measured heights when they are available", () => {
    const files = [makeFile("src/a.ts", 10), makeFile("src/b.ts", 20)];
    const layout = buildDiffSectionLayout({
      collapsedPaths: new Set<string>(),
      files,
      measuredHeights: {
        "src/a.ts": 320,
      },
    });

    expect(layout.items[0]).toMatchObject({
      end: 320,
      height: 320,
      start: 0,
    });
    expect(layout.items[1]!.start).toBe(320);
  });

  test("falls back to collapsed estimates when sections are collapsed", () => {
    const file = makeFile("src/collapsed.ts", 80);
    const layout = buildDiffSectionLayout({
      collapsedPaths: new Set([file.name]),
      files: [file],
      measuredHeights: {},
    });

    expect(layout.totalHeight).toBe(estimateDiffSectionHeight(file, true));
  });
});

describe("findDiffSectionIndexAtOffset", () => {
  test("returns the item containing the provided offset", () => {
    const files = [makeFile("src/a.ts", 10), makeFile("src/b.ts", 20), makeFile("src/c.ts", 30)];
    const layout = buildDiffSectionLayout({
      collapsedPaths: new Set<string>(),
      files,
      measuredHeights: {
        "src/a.ts": 100,
        "src/b.ts": 200,
        "src/c.ts": 300,
      },
    });

    expect(findDiffSectionIndexAtOffset(layout, 0)).toBe(0);
    expect(findDiffSectionIndexAtOffset(layout, 99)).toBe(0);
    expect(findDiffSectionIndexAtOffset(layout, 100)).toBe(1);
    expect(findDiffSectionIndexAtOffset(layout, 299)).toBe(1);
    expect(findDiffSectionIndexAtOffset(layout, 300)).toBe(2);
  });
});

describe("getVirtualDiffRange", () => {
  test("returns an inclusive window around the viewport", () => {
    const files = [makeFile("src/a.ts", 10), makeFile("src/b.ts", 20), makeFile("src/c.ts", 30)];
    const layout = buildDiffSectionLayout({
      collapsedPaths: new Set<string>(),
      files,
      measuredHeights: {
        "src/a.ts": 100,
        "src/b.ts": 200,
        "src/c.ts": 300,
      },
    });

    expect(getVirtualDiffRange(layout, 120, 100, 0)).toEqual({
      endIndex: 2,
      startIndex: 1,
    });
  });

  test("always includes at least one item", () => {
    const layout = buildDiffSectionLayout({
      collapsedPaths: new Set<string>(),
      files: [makeFile("src/a.ts", 10)],
      measuredHeights: {
        "src/a.ts": 100,
      },
    });

    expect(getVirtualDiffRange(layout, 0, 0, 0)).toEqual({
      endIndex: 1,
      startIndex: 0,
    });
  });
});

describe("buildPatchRenderCacheKey", () => {
  test("stays stable for identical patch content", () => {
    const first = buildPatchRenderCacheKey("workspace:diff", "alpha\nbeta\n");
    const second = buildPatchRenderCacheKey("workspace:diff", "alpha\nbeta\n");
    const third = buildPatchRenderCacheKey("workspace:diff", "alpha\nbeta!\n");

    expect(first).toBe(second);
    expect(first).not.toBe(third);
  });
});
