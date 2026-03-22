import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ExplorerTree,
  collectCollapsedExplorerPaths,
  reconcileCollapsedExplorerPaths,
} from "@/features/explorer/components/explorer-tree";

function renderExplorerTree() {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(ExplorerTree, {
        activeFilePath: "",
        entries: [
          { extension: "md", file_path: "README.md" },
          { extension: "tsx", file_path: "src/app.tsx" },
          { extension: "tsx", file_path: "src/components/button.tsx" },
        ],
        error: null,
        isLoading: false,
        onOpenFile: () => {},
      }),
      storageKey: "test.theme",
    }),
  );
}

describe("ExplorerTree", () => {
  test("starts with directories collapsed by default", () => {
    const markup = renderExplorerTree();

    expect(markup).toContain("README.md");
    expect(markup).toContain(">src</span>");
    expect(markup).not.toContain("app.tsx");
    expect(markup).not.toContain("button.tsx");
  });

  test("preserves expanded folders while collapsing newly discovered directories", () => {
    const previousDirectoryPaths = collectCollapsedExplorerPaths([
      {
        children: [
          {
            extension: "tsx",
            kind: "file",
            name: "app.tsx",
            path: "src/app.tsx",
          },
          {
            children: [
              {
                extension: "tsx",
                kind: "file",
                name: "button.tsx",
                path: "src/components/button.tsx",
              },
            ],
            kind: "directory",
            name: "components",
            path: "src/components",
          },
        ],
        kind: "directory",
        name: "src",
        path: "src",
      },
    ]);
    const nextDirectoryPaths = collectCollapsedExplorerPaths([
      {
        children: [
          {
            extension: "tsx",
            kind: "file",
            name: "app.tsx",
            path: "src/app.tsx",
          },
          {
            children: [
              {
                extension: "tsx",
                kind: "file",
                name: "button.tsx",
                path: "src/components/button.tsx",
              },
            ],
            kind: "directory",
            name: "components",
            path: "src/components",
          },
          {
            children: [
              {
                extension: "ts",
                kind: "file",
                name: "use-file-tree.ts",
                path: "src/hooks/use-file-tree.ts",
              },
            ],
            kind: "directory",
            name: "hooks",
            path: "src/hooks",
          },
        ],
        kind: "directory",
        name: "src",
        path: "src",
      },
    ]);

    const collapsedPaths = reconcileCollapsedExplorerPaths(
      new Set(["src/components"]),
      previousDirectoryPaths,
      nextDirectoryPaths,
    );

    expect([...collapsedPaths].sort()).toEqual(["src/components", "src/hooks"]);
  });
});
