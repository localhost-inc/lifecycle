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

  test("renders the ready indicator in the right-side session status slot", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        responseReady: true,
        workspace,
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain('data-slot="workspace-session-status"');
    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).toContain("justify-end");
    expect(markup).not.toContain(">Ready</span>");
    expect(markup).not.toContain("absolute left-1 top-1/2 -translate-y-1/2");
  });

  test("renders a loading spinner in the same right-side session status slot", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        running: true,
        workspace,
        selected: false,
        onDestroy: () => {},
        onSelect: () => {},
      }),
    );

    expect(markup).toContain('data-slot="workspace-session-status"');
    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('title="Generating response"');
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

    expect(markup).not.toContain("bg-[var(--sidebar-selected)]");
    expect(markup).toContain("bg-[var(--muted)]");
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
    expect(markup).toContain("hover:bg-[var(--surface-hover)]");
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
