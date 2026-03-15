import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceTreeItem } from "./workspace-tree-item";

const workspace = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Auth Flow Fix",
  kind: "managed" as const,
  source_ref: "lifecycle/ember-atlas-42",
  git_sha: null,
  worktree_path: "/tmp/workspace_1",
  mode: "local" as const,
  status: "active" as const,
  failure_reason: null,
  failed_at: null,
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-01T12:00:00.000Z",
  updated_at: "2026-03-07T12:00:00.000Z",
  last_active_at: "2026-03-07T12:00:00.000Z",
  expires_at: null,
};

describe("WorkspaceTreeItem", () => {
  test("renders the workspace display name without a status dot", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("Auth Flow Fix");
    expect(markup).not.toContain("lifecycle/ember-atlas-42</span>");
    expect(markup).not.toContain('title="Active"');
  });

  test("renders the ready indicator in the left icon slot while preserving the timestamp", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        responseReady: true,
        workspace,
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).not.toContain('data-slot="workspace-session-status"');
    expect(markup).toContain("min-w-9 text-right");
    expect(markup).not.toContain(">Ready</span>");
  });

  test("renders a loading spinner in the left icon slot while preserving the timestamp", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        running: true,
        workspace,
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('title="Generating response"');
    expect(markup).not.toContain('data-slot="workspace-session-status"');
    expect(markup).toContain("min-w-9 text-right");
  });

  test("uses a subtle pill background for the selected workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: true,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("bg-[var(--sidebar-selected)]");
    expect(markup).toContain("opacity-100");
    expect(markup).toContain("text-[var(--sidebar-foreground)]");
  });

  test("dims inactive workspace text while keeping hover contrast", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("opacity-80");
    expect(markup).toContain("hover:opacity-100");
    expect(markup).toContain("hover:bg-[var(--sidebar-hover)]");
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("text-[var(--sidebar-foreground)]");
  });

  test("swaps the time label out for the archive action on hover", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain('title="Archive workspace"');
    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain("group-hover/workspace-item:opacity-0");
    expect(markup).toContain("group-hover/workspace-item:pointer-events-auto");
    expect(markup).toContain("group-hover/workspace-item:opacity-100");
    expect(markup).toContain("disabled:opacity-0");
    expect(markup).toContain("group-hover/workspace-item:disabled:opacity-50");
    expect(markup).not.toContain("group-focus-within/menu-item:opacity-100");
  });

  test("renders root workspaces with the branch name and a kind icon", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace: {
          ...workspace,
          kind: "root",
          name: "Root",
          source_ref: "main",
        },
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain(">main<");
    expect(markup).not.toContain(">Root<");
    expect(markup).toContain('aria-label="Archive workspace main"');
  });

  test("renders managed workspaces with a kind icon", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain(">Auth Flow Fix<");
  });
});
