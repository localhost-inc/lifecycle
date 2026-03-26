import { describe, expect, test } from "bun:test";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { AppShellOutletContext } from "@/components/layout/app-shell-context";
import { WorkspaceToolbarProvider } from "@/features/workspaces/state/workspace-toolbar-context";

const project: ProjectRecord = {
  id: "project_1",
  name: "Lifecycle",
  path: "/tmp/lifecycle",
  manifestPath: "/tmp/lifecycle/lifecycle.json",
  manifestValid: true,
  createdAt: "2026-03-14T10:00:00.000Z",
  updatedAt: "2026-03-14T10:00:00.000Z",
};

const workspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "setup",
  checkout_type: "worktree",
  source_ref: "lifecycle/setup",
  git_sha: "54012c8f",
  worktree_path: "/tmp/lifecycle-setup",
  host: "local",
  manifest_fingerprint: "manifest_1",
  created_at: "2026-03-14T10:00:00.000Z",
  updated_at: "2026-03-14T10:00:00.000Z",
  last_active_at: "2026-03-14T10:00:00.000Z",
  status: "active",
  failure_reason: null,
  failed_at: null,
};

function renderProjectRoute(
  ProjectRoute: ComponentType,
  contextOverrides: Partial<AppShellOutletContext> = {},
  entry = "/projects/project_1",
) {
  const context: AppShellOutletContext = {
    activeShellContext: {
      id: "personal",
      kind: "personal",
      name: "Personal",
      persisted: false,
    },
    onCreateWorkspace: async () => {},
    onArchiveWorkspace: async () => {},
    onOpenSettings: () => {},
    onOpenWorkspace: () => {},
    onRemoveProject: async () => {},
    projectCatalog: undefined,
    projects: [project],
    workspacesByProjectId: {
      [project.id]: [workspace],
    },
    ...contextOverrides,
  };

  function OutletContextBoundary() {
    return <Outlet context={context} />;
  }

  function IndexStub() {
    return <main data-slot="index-redirect">Index Redirect</main>;
  }

  function WorkspaceStub() {
    return <main data-slot="workspace-shell">Workspace Layout</main>;
  }

  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      storageKey: "test.theme",
      children: createElement(WorkspaceToolbarProvider, {
        children: createElement(MemoryRouter, {
          initialEntries: [entry],
          children: createElement(Routes, {
            children: createElement(
              Route,
              { element: createElement(OutletContextBoundary) },
              createElement(
                Route,
                {
                  element: createElement(ProjectRoute),
                  path: "/projects/:projectId",
                },
                createElement(Route, { index: true, element: createElement(IndexStub) }),
                createElement(Route, {
                  path: "workspaces/:workspaceId",
                  element: createElement(WorkspaceStub),
                }),
              ),
            ),
          }),
        }),
      }),
    }),
  );
}

describe("ProjectRoute", () => {
  test("renders child route content via outlet", async () => {
    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(ProjectRoute);

    expect(markup).toContain('data-slot="index-redirect"');
  });

  test("renders workspace child route when navigating to a workspace", async () => {
    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(
      ProjectRoute,
      {},
      "/projects/project_1/workspaces/workspace_1",
    );

    expect(markup).toContain('data-slot="workspace-shell"');
  });

  test("renders empty state when project is not found", async () => {
    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(ProjectRoute, { projects: [] });

    expect(markup).toContain("Project not found");
  });
});
