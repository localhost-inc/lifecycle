import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mockStoreContext } from "@/test/store-mock";
import type { WorkspaceFileTreeEntry } from "@lifecycle/workspace/client";

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
  workspaceHost = "local",
  worktreePath = "/tmp/workspace",
}: {
  entries?: WorkspaceFileTreeEntry[];
  workspaceHost?: "cloud" | "docker" | "local" | "remote";
  worktreePath?: string | null;
} = {}) {
  const hooksModule = await import("../../workspaces/hooks");
  const explorerTreeSpy = spyOn(hooksModule, "useWorkspaceFileTree").mockReturnValue(
    readyQueryResult(entries ?? []) as never,
  );
  const { ExplorerPanel } = await import("./explorer-panel");

  return {
    explorerTreeSpy,
    markup: renderToStaticMarkup(
      createElement(ExplorerPanel, {
        onOpenFile: () => {},
        workspaceId: "workspace_1",
        workspaceHost,
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

    expect(explorerTreeSpy).toHaveBeenCalledWith("workspace_1", "local");
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
      workspaceHost: "docker",
    });

    expect(explorerTreeSpy).toHaveBeenCalledWith("workspace_1", "docker");
    expect(markup).toContain("README.md");
    expect(markup).toContain(">src</span>");
  });

  test("shows an unavailable state when no local worktree is available", async () => {
    const { explorerTreeSpy, markup } = await renderExplorerPanel({
      workspaceHost: "cloud",
      worktreePath: null,
    });

    expect(explorerTreeSpy).toHaveBeenCalledWith(null, null);
    expect(markup).toContain("Explorer unavailable");
    expect(markup).toContain("local worktree");
  });
});
