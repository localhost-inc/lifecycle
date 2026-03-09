import { describe, expect, test } from "bun:test";
import { buildFileTree, type FileTreeDirectory, type FileTreeLeaf } from "./file-tree";
import type { FileDiffMetadata } from "@pierre/diffs/react";

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

describe("buildFileTree", () => {
  test("returns empty array for no files", () => {
    expect(buildFileTree([])).toEqual([]);
  });

  test("flat files at root level", () => {
    const tree = buildFileTree([makeFile("README.md", 10, 2), makeFile("package.json", 1, 0)]);

    expect(tree).toHaveLength(2);
    expect(tree[0]!.kind).toBe("file");
    expect(tree[0]!.name).toBe("README.md");
    expect((tree[0] as FileTreeLeaf).additions).toBe(10);
    expect((tree[0] as FileTreeLeaf).deletions).toBe(2);
    expect(tree[1]!.kind).toBe("file");
    expect(tree[1]!.name).toBe("package.json");
  });

  test("nested directories", () => {
    const tree = buildFileTree([
      makeFile("src/components/Button.tsx", 5, 3),
      makeFile("src/components/Input.tsx", 2, 1),
      makeFile("src/index.ts", 1, 0),
    ]);

    expect(tree).toHaveLength(1);
    const src = tree[0] as FileTreeDirectory;
    expect(src.kind).toBe("directory");
    expect(src.name).toBe("src");
    expect(src.children).toHaveLength(2);

    const components = src.children.find(
      (c) => c.kind === "directory" && c.name === "components",
    ) as FileTreeDirectory;
    expect(components).toBeDefined();
    expect(components.children).toHaveLength(2);

    const indexFile = src.children.find((c) => c.kind === "file") as FileTreeLeaf;
    expect(indexFile.name).toBe("index.ts");
  });

  test("collapses single-child directory chains", () => {
    const tree = buildFileTree([makeFile("apps/desktop/src/main.ts", 4, 0)]);

    // apps/desktop/src should collapse into one directory node
    expect(tree).toHaveLength(1);
    const collapsed = tree[0] as FileTreeDirectory;
    expect(collapsed.kind).toBe("directory");
    expect(collapsed.name).toBe("apps/desktop/src");
    expect(collapsed.path).toBe("apps/desktop/src");
    expect(collapsed.children).toHaveLength(1);
    expect(collapsed.children[0]!.kind).toBe("file");
    expect(collapsed.children[0]!.name).toBe("main.ts");
  });

  test("does not collapse when directory has multiple children", () => {
    const tree = buildFileTree([makeFile("src/a.ts", 1, 0), makeFile("src/b.ts", 2, 0)]);

    expect(tree).toHaveLength(1);
    const src = tree[0] as FileTreeDirectory;
    expect(src.name).toBe("src");
    expect(src.children).toHaveLength(2);
  });

  test("aggregates stats from leaves up to directories", () => {
    const tree = buildFileTree([makeFile("src/a.ts", 10, 2), makeFile("src/b.ts", 5, 3)]);

    const src = tree[0] as FileTreeDirectory;
    expect(src.additions).toBe(15);
    expect(src.deletions).toBe(5);
  });

  test("handles renamed files", () => {
    const fileDiff: FileDiffMetadata = {
      name: "src/new-name.ts",
      prevName: "src/old-name.ts",
      type: "rename-changed",
      hunks: [
        {
          collapsedBefore: 0,
          splitLineStart: 0,
          splitLineCount: 0,
          unifiedLineStart: 0,
          unifiedLineCount: 0,
          additionCount: 0,
          additionStart: 0,
          additionLines: 3,
          deletionCount: 0,
          deletionStart: 0,
          deletionLines: 1,
          hunkContent: [],
          hunkContext: undefined,
          hunkSpecs: undefined,
        },
      ],
      splitLineCount: 0,
      unifiedLineCount: 0,
    };

    const tree = buildFileTree([fileDiff]);
    expect(tree).toHaveLength(1);
    const src = tree[0] as FileTreeDirectory;
    expect(src.kind).toBe("directory");
    const leaf = src.children[0] as FileTreeLeaf;
    expect(leaf.name).toBe("new-name.ts");
    expect(leaf.path).toBe("src/new-name.ts");
    expect(leaf.fileDiff.prevName).toBe("src/old-name.ts");
  });

  test("mixed depth files produce correct structure", () => {
    const tree = buildFileTree([
      makeFile("README.md", 1, 0),
      makeFile("src/index.ts", 2, 0),
      makeFile("src/utils/helpers.ts", 3, 0),
    ]);

    expect(tree).toHaveLength(2);

    const readme = tree.find((n) => n.kind === "file") as FileTreeLeaf;
    expect(readme.name).toBe("README.md");

    const src = tree.find((n) => n.kind === "directory") as FileTreeDirectory;
    expect(src.name).toBe("src");
    expect(src.additions).toBe(5);
    expect(src.children).toHaveLength(2);
  });
});
