import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceTreeItem } from "./workspace-tree-item";

const workspace = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Auth Flow Fix",
  source_ref: "lifecycle/ember-atlas-42",
  git_sha: null,
  worktree_path: "/tmp/workspace_1",
  mode: "local" as const,
  status: "ready" as const,
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
  test("renders the workspace display name instead of the branch ref", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: false,
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("Auth Flow Fix");
    expect(markup).not.toContain("lifecycle/ember-atlas-42</span>");
  });

  test("renders a visible response-ready marker without shifting the row layout", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        responseReady: true,
        workspace,
        selected: false,
        onSelect: () => {},
      }),
    );

    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).toContain("absolute left-1 top-1/2 -translate-y-1/2");
    expect(markup).toContain("bg-amber-400");
    expect(markup).toContain("animate-ping");
  });

  test("uses the shared selected sidebar treatment", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: true,
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("bg-[var(--sidebar-selected)]");
    expect(markup).toContain("text-[var(--sidebar-foreground)]");
    expect(markup).toContain("opacity-70");
  });

  test("uses the shared idle sidebar hover treatment", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: false,
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("text-[var(--sidebar-foreground)]");
    expect(markup).toContain("hover:bg-[var(--sidebar-hover)]");
    expect(markup).toContain("text-[var(--sidebar-muted-foreground)]");
  });
});
