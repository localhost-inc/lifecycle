import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TitleBar } from "./title-bar";

function renderTitleBar(selectedWorkspace: Parameters<typeof TitleBar>[0]["selectedWorkspace"]) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(
        MemoryRouter,
        null,
        createElement(TitleBar, {
          selectedWorkspace,
        }),
      ),
      storageKey: "lifecycle.desktop.theme.test.v1",
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
      source_ref: "lifecycle/fix-landing-hero",
      git_sha: "abcdef1234567890",
      worktree_path: "/tmp/workspace_1",
      mode: "local",
      status: "ready",
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
  });

  test("does not render title bar actions for non-interactive workspaces", () => {
    const markup = renderTitleBar({
      id: "workspace_1",
      project_id: "project_1",
      name: "Cloud Preview",
      source_ref: "main",
      git_sha: null,
      worktree_path: null,
      mode: "cloud",
      status: "ready",
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
});
