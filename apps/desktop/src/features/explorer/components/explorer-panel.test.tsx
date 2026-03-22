import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceFileTreeEntry } from "@/features/workspaces/api";

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
  workspaceTarget = "local",
  worktreePath = "/tmp/workspace",
}: {
  entries?: WorkspaceFileTreeEntry[];
  workspaceTarget?: "cloud" | "docker" | "local" | "remote";
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
        workspaceTarget,
        worktreePath,
      }),
    ),
  };
}

describe("ExplorerPanel", () => {
  afterEach(() => {
    mock.restore();
  });

  test("reads and renders the explorer tree for local workspaces", async () => {
    const { explorerTreeSpy, markup } = await renderExplorerPanel({
      entries: [
        { extension: "md", file_path: "README.md" },
        { extension: "tsx", file_path: "src/app.tsx" },
      ],
    });

    expect(explorerTreeSpy).toHaveBeenCalledWith("workspace_1");
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
      workspaceTarget: "docker",
    });

    expect(explorerTreeSpy).toHaveBeenCalledWith("workspace_1");
    expect(markup).toContain("README.md");
    expect(markup).toContain(">src</span>");
  });

  test("shows an unavailable state when no local worktree is available", async () => {
    const { explorerTreeSpy, markup } = await renderExplorerPanel({
      workspaceTarget: "cloud",
      worktreePath: null,
    });

    expect(explorerTreeSpy).toHaveBeenCalledWith(null);
    expect(markup).toContain("Explorer unavailable");
    expect(markup).toContain("local worktree");
  });
});
