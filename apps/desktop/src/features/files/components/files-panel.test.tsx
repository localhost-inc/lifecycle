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

async function renderFilesPanel({
  entries,
  workspaceTarget = "local",
  worktreePath = "/tmp/workspace",
}: {
  entries?: WorkspaceFileTreeEntry[];
  workspaceTarget?: "cloud" | "docker" | "local" | "remote";
  worktreePath?: string | null;
} = {}) {
  const hooksModule = await import("../../workspaces/hooks");
  const fileTreeSpy = spyOn(hooksModule, "useWorkspaceFileTree").mockReturnValue(
    readyQueryResult(entries ?? []) as never,
  );
  const { FilesPanel } = await import("./files-panel");

  return {
    fileTreeSpy,
    markup: renderToStaticMarkup(
      createElement(FilesPanel, {
        onOpenFile: () => {},
        workspaceId: "workspace_1",
        workspaceTarget,
        worktreePath,
      }),
    ),
  };
}

describe("FilesPanel", () => {
  afterEach(() => {
    mock.restore();
  });

  test("reads and renders the workspace file tree for local workspaces", async () => {
    const { fileTreeSpy, markup } = await renderFilesPanel({
      entries: [
        { extension: "md", file_path: "README.md" },
        { extension: "tsx", file_path: "src/app.tsx" },
      ],
    });

    expect(fileTreeSpy).toHaveBeenCalledWith("workspace_1");
    expect(markup).toContain("README.md");
    expect(markup).toContain(">src</span>");
    expect(markup).toContain('title="src"');
    expect(markup).not.toContain("app.tsx");
  });

  test("renders the workspace file tree for docker workspaces with a local worktree", async () => {
    const { fileTreeSpy, markup } = await renderFilesPanel({
      entries: [
        { extension: "md", file_path: "README.md" },
        { extension: "tsx", file_path: "src/app.tsx" },
      ],
      workspaceTarget: "docker",
    });

    expect(fileTreeSpy).toHaveBeenCalledWith("workspace_1");
    expect(markup).toContain("README.md");
    expect(markup).toContain(">src</span>");
  });

  test("shows an unavailable state when no local worktree is available", async () => {
    const { fileTreeSpy, markup } = await renderFilesPanel({
      workspaceTarget: "cloud",
      worktreePath: null,
    });

    expect(fileTreeSpy).toHaveBeenCalledWith(null);
    expect(markup).toContain("Files unavailable");
    expect(markup).toContain("local worktree");
  });
});
