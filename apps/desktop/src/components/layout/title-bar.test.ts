import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TitleBar } from "./title-bar";

function renderTitleBar(
  selectedWorkspace: Parameters<typeof TitleBar>[0]["selectedWorkspace"],
  sourceWorkspace?: Parameters<typeof TitleBar>[0]["sourceWorkspace"],
) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(
        MemoryRouter,
        null,
        createElement(TitleBar, {
          selectedWorkspace,
          sourceWorkspace,
        }),
      ),
      storageKey: "lifecycle.desktop.theme.test",
    }),
  );
}

describe("TitleBar", () => {
  test("does not render history actions in the top bar", () => {
    const markup = renderTitleBar(null);

    expect(markup).not.toContain('aria-label="Go back"');
    expect(markup).not.toContain('aria-label="Go forward"');
  });

  test("renders the workspace display name in the title area", () => {
    const markup = renderTitleBar({
      id: "workspace_1",
      project_id: "project_1",
      name: "Fix Landing Hero",
      kind: "managed",
      source_ref: "lifecycle/fix-landing-hero",
      git_sha: "abcdef1234567890",
      worktree_path: "/tmp/workspace_1",
      mode: "local",
      status: "active",
      failure_reason: null,
      failed_at: null,
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-08T10:00:00.000Z",
      updated_at: "2026-03-08T10:00:00.000Z",
      last_active_at: "2026-03-08T10:00:00.000Z",
      expires_at: null,
    });

    expect(markup).toContain("Fix Landing Hero");
    expect(markup).toContain("abcdef12");
    expect(markup).toContain("Open");
    expect(markup).toContain('title="Open in VS Code"');
    expect(markup).not.toContain("bg-emerald-500");
  });

  test("does not render title bar actions for non-interactive workspaces", () => {
    const markup = renderTitleBar({
      id: "workspace_1",
      project_id: "project_1",
      name: "Cloud Preview",
      kind: "managed",
      source_ref: "main",
      git_sha: null,
      worktree_path: null,
      mode: "cloud",
      status: "active",
      failure_reason: null,
      failed_at: null,
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-08T10:00:00.000Z",
      updated_at: "2026-03-08T10:00:00.000Z",
      last_active_at: "2026-03-08T10:00:00.000Z",
      expires_at: null,
    });

    expect(markup).not.toContain('title="Open in VS Code"');
  });

  test("renders the fork source workspace in the title area", () => {
    const markup = renderTitleBar(
      {
        id: "workspace_2",
        project_id: "project_1",
        name: "Review",
        kind: "managed",
        source_ref: "lifecycle/review",
        git_sha: "abcdef1234567890",
        worktree_path: "/tmp/workspace_2",
        mode: "local",
        status: "active",
        failure_reason: null,
        failed_at: null,
        created_by: null,
        source_workspace_id: "workspace_root",
        created_at: "2026-03-08T10:00:00.000Z",
        updated_at: "2026-03-08T10:00:00.000Z",
        last_active_at: "2026-03-08T10:00:00.000Z",
        expires_at: null,
      },
      {
        id: "workspace_root",
        project_id: "project_1",
        name: "Root",
        kind: "root",
        source_ref: "main",
        git_sha: "1234567890abcdef",
        worktree_path: "/tmp/project_1",
        mode: "local",
        status: "active",
        failure_reason: null,
        failed_at: null,
        created_by: null,
        source_workspace_id: null,
        created_at: "2026-03-08T10:00:00.000Z",
        updated_at: "2026-03-08T10:00:00.000Z",
        last_active_at: "2026-03-08T10:00:00.000Z",
        expires_at: null,
      },
    );

    expect(markup).toContain("Review");
    expect(markup).toContain("from main");
  });

  test("renders root workspaces with the live branch name and root indicator", () => {
    const markup = renderTitleBar({
      id: "workspace_root",
      project_id: "project_1",
      name: "Root",
      kind: "root",
      source_ref: "main",
      git_sha: "abcdef1234567890",
      worktree_path: "/tmp/project_1",
      mode: "local",
      status: "active",
      failure_reason: null,
      failed_at: null,
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-08T10:00:00.000Z",
      updated_at: "2026-03-08T10:00:00.000Z",
      last_active_at: "2026-03-08T10:00:00.000Z",
      expires_at: null,
    });

    expect(markup).toContain('data-slot="workspace-root-indicator"');
    expect(markup).toContain("main");
    expect(markup).not.toContain(">Root<");
    expect(markup).toContain('title="main"');
  });
});
