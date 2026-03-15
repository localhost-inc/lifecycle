import type { ProjectRecord } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ProjectSidebar } from "./project-sidebar";

const project: ProjectRecord = {
  createdAt: "2026-03-14T10:00:00.000Z",
  id: "project_1",
  manifestPath: "/tmp/lifecycle/lifecycle.json",
  manifestValid: true,
  name: "Lifecycle",
  path: "/tmp/lifecycle",
  updatedAt: "2026-03-14T10:00:00.000Z",
};

describe("ProjectSidebar", () => {
  test("renders project view icons in the sidebar nav", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(MemoryRouter, {
          children: createElement(ProjectSidebar, {
            activeViewId: "overview",
            hasWorkspaceResponseReady: () => false,
            hasWorkspaceRunningTurn: () => false,
            onCreateWorkspace: () => {},
            onDestroyWorkspace: () => {},
            onOpenProjectView: () => {},
            onOpenWorkspace: () => {},
            onRemoveProject: () => {},
            project,
            selectedWorkspaceId: null,
            workspaces: [],
          }),
        }),
      }),
    );

    expect(markup).toContain(">Overview<");
    expect(markup).toContain(">Pull Requests<");
    expect(markup).toContain(">Activity<");
    expect(markup).toContain("lucide-layout-grid");
    expect(markup).toContain("lucide-git-pull-request");
    expect(markup).toContain("lucide-activity");
    expect(markup).toContain("bg-[var(--sidebar-background)]");
    expect(markup).toContain('data-slot="project-sidebar-header"');
    expect(markup).toContain("flex h-10 items-center border-b border-[var(--border)] px-3");
    expect(markup.match(/Create workspace for Lifecycle/g)?.length ?? 0).toBe(1);
  });

  test("renders workspace readiness indicators in the sidebar list", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(MemoryRouter, {
          children: createElement(ProjectSidebar, {
            activeViewId: "overview",
            hasWorkspaceResponseReady: (workspaceId) => workspaceId === "workspace_1",
            hasWorkspaceRunningTurn: () => false,
            onCreateWorkspace: () => {},
            onDestroyWorkspace: () => {},
            onOpenProjectView: () => {},
            onOpenWorkspace: () => {},
            onRemoveProject: () => {},
            project,
            selectedWorkspaceId: "workspace_1",
            workspaces: [
              {
                created_at: "2026-03-14T10:00:00.000Z",
                created_by: null,
                expires_at: null,
                failed_at: null,
                failure_reason: null,
                git_sha: null,
                id: "workspace_1",
                kind: "managed",
                last_active_at: "2026-03-14T10:00:00.000Z",
                manifest_fingerprint: "manifest_1",
                mode: "local",
                name: "Setup",
                project_id: "project_1",
                source_ref: "lifecycle/setup",
                source_workspace_id: null,
                status: "active",
                updated_at: "2026-03-14T10:00:00.000Z",
                worktree_path: "/tmp/lifecycle-setup",
              },
            ],
          }),
        }),
      }),
    );

    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).not.toContain('data-slot="workspace-session-status"');
    expect(markup).toContain("min-w-9 text-right");
  });
});
