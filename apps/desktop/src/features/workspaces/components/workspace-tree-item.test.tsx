import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceTreeItem } from "./workspace-tree-item";

const workspace = {
  id: "workspace_1",
  project_id: "project_1",
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
  test("uses the shared selected panel treatment", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: true,
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("bg-[var(--surface-selected)]");
    expect(markup).toContain("text-[var(--foreground)]");
    expect(markup).toContain("opacity-70");
  });

  test("uses the shared idle hover treatment", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTreeItem, {
        workspace,
        selected: false,
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("text-[var(--muted-foreground)]");
    expect(markup).toContain("hover:bg-[var(--surface-hover)]");
    expect(markup).toContain("hover:text-[var(--foreground)]");
  });
});
