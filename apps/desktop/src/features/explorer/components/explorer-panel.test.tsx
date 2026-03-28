import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as reactQuery from "@tanstack/react-query";
import { mockStoreContext } from "@/test/store-mock";
import type { WorkspaceFileTreeEntry } from "@lifecycle/workspace";

function readyQueryResult<T>(data: T) {
  return {
    data,
    error: null,
    isLoading: false,
    refresh: async () => {},
    status: "ready" as const,
  };
}

async function renderExplorerPanel({
  entries,
  worktreePath = "/tmp/workspace",
}: {
  entries?: WorkspaceFileTreeEntry[];
  worktreePath?: string | null;
} = {}) {
  const explorerTreeSpy = spyOn(reactQuery, "useQuery").mockReturnValue(
    readyQueryResult(entries ?? []) as never,
  );
  const { ExplorerPanel } = await import("./explorer-panel");

  return {
    explorerTreeSpy,
    markup: renderToStaticMarkup(
      createElement(ExplorerPanel, {
        onOpenFile: () => {},
        workspaceId: "workspace_1",
        worktreePath,
      }),
    ),
  };
}

describe("ExplorerPanel", () => {
  beforeEach(() => mockStoreContext());
  afterEach(() => mock.restore());

  test("reads and renders the explorer tree for local workspaces", async () => {
    const { explorerTreeSpy, markup } = await renderExplorerPanel({
      entries: [
        { extension: "md", file_path: "README.md" },
        { extension: "tsx", file_path: "src/app.tsx" },
      ],
    });

    expect(explorerTreeSpy).toHaveBeenCalled();
    expect(markup).toContain("README.md");
    expect(markup).toContain(">src</span>");
    expect(markup).toContain('title="src"');
    expect(markup).not.toContain("app.tsx");
  });

  test("renders the explorer tree for docker workspaces with a local worktree", async () => {
    const { explorerTreeSpy, markup } = await renderExplorerPanel({
      entries: [
        { extension: "md", file_path: "README.md" },
        { extension: "tsx", file_path: "src/app.tsx" },
      ],
    });

    expect(explorerTreeSpy).toHaveBeenCalled();
    expect(markup).toContain("README.md");
    expect(markup).toContain(">src</span>");
  });

  test("shows an unavailable state when no local worktree is available", async () => {
    const { explorerTreeSpy, markup } = await renderExplorerPanel({
      worktreePath: null,
    });

    expect(explorerTreeSpy).toHaveBeenCalled();
    expect(markup).toContain("Explorer unavailable");
    expect(markup).toContain("local worktree");
  });
});
