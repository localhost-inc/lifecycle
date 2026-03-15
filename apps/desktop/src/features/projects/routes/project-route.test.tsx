import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { AppShellOutletContext } from "../../../components/layout/app-shell-context";

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
  kind: "managed",
  source_ref: "lifecycle/setup",
  git_sha: "54012c8f",
  worktree_path: "/tmp/lifecycle-setup",
  mode: "local",
  status: "idle",
  manifest_fingerprint: "manifest_1",
  failure_reason: null,
  failed_at: null,
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-14T10:00:00.000Z",
  updated_at: "2026-03-14T10:00:00.000Z",
  last_active_at: "2026-03-14T10:00:00.000Z",
  expires_at: null,
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
    onDestroyWorkspace: async () => {},
    onForkWorkspace: async () => {},
    onOpenWorkspace: () => {},
    onToggleProjectNavigation: () => {},
    onProjectNavigationResizeKeyDown: () => {},
    onProjectNavigationResizePointerDown: () => {},
    onRemoveProject: async () => {},
    projectCatalog: undefined,
    projectNavigationCollapsed: false,
    projectNavigationWidth: 280,
    projects: [project],
    workspacesByProjectId: {
      [project.id]: [workspace],
    },
    ...contextOverrides,
  };

  function OutletContextBoundary() {
    return <Outlet context={context} />;
  }

  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      storageKey: "test.theme",
      children: createElement(MemoryRouter, {
        initialEntries: [entry],
        children: createElement(Routes, {
          children: createElement(Route, {
            element: createElement(OutletContextBoundary),
            children: createElement(Route, {
              element: createElement(ProjectRoute),
              path: "/projects/:projectId",
            }),
          }),
        }),
      }),
    }),
  );
}

describe("ProjectRoute", () => {
  afterEach(() => {
    mock.restore();
  });

  test("renders page tabs in the right-hand project main beside the sidebar", async () => {
    const overviewSurfaceModule = await import("../components/project-overview-surface");
    spyOn(overviewSurfaceModule, "ProjectOverviewSurface").mockImplementation((() =>
      createElement("main", { "data-slot": "project-page" }, "Overview Surface")) as never);

    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(ProjectRoute);

    expect(markup).toContain('data-slot="project-page-tabs"');
    expect(markup).toContain('data-slot="project-layout"');
    expect(markup).toContain('data-slot="project-main"');
    expect(markup).toContain('data-slot="project-sidebar"');
    expect(markup).toContain('data-slot="project-page"');
    expect(markup).toContain('data-slot="app-status-bar"');
    expect(markup.indexOf('data-slot="project-layout"')).toBeLessThan(
      markup.indexOf('data-slot="project-sidebar"'),
    );
    expect(markup.indexOf('data-slot="project-sidebar"')).toBeLessThan(
      markup.indexOf('data-slot="project-main"'),
    );
    expect(markup.indexOf('data-slot="project-main"')).toBeLessThan(
      markup.indexOf('data-slot="project-page-tabs"'),
    );
    expect(markup.indexOf('data-slot="project-page-tabs"')).toBeLessThan(
      markup.indexOf('data-slot="project-page"'),
    );
    expect(markup.indexOf('data-slot="project-page"')).toBeLessThan(
      markup.indexOf('data-slot="app-status-bar"'),
    );
  });

  test("omits the project navigation panel when the shell collapses it", async () => {
    const overviewSurfaceModule = await import("../components/project-overview-surface");
    spyOn(overviewSurfaceModule, "ProjectOverviewSurface").mockImplementation((() =>
      createElement("main", { "data-slot": "project-page" }, "Overview Surface")) as never);

    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(ProjectRoute, {
      projectNavigationCollapsed: true,
    });

    expect(markup).toContain('data-slot="project-layout"');
    expect(markup).toContain('data-slot="project-main"');
    expect(markup).not.toContain('data-slot="project-sidebar"');
  });

  test("renders a workspace header below the page tabs for workspace tabs", async () => {
    const workspaceTabContentModule =
      await import("../../workspaces/components/workspace-tab-content");
    spyOn(workspaceTabContentModule, "WorkspaceTabContent").mockImplementation((() =>
      createElement("main", { "data-slot": "workspace-layout" }, "Workspace Layout")) as never);

    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(
      ProjectRoute,
      {},
      "/projects/project_1?workspace=workspace_1",
    );

    expect(markup).toContain('data-slot="project-page-tabs"');
    expect(markup).toContain('data-slot="workspace-header"');
    expect(markup).toContain('data-slot="workspace"');
    expect(markup).toContain('data-slot="workspace-layout"');
    expect(markup).toContain(">Fork<");
    expect(markup.indexOf('data-slot="project-page-tabs"')).toBeLessThan(
      markup.indexOf('data-slot="workspace"'),
    );
    expect(markup.indexOf('data-slot="workspace"')).toBeLessThan(
      markup.indexOf('data-slot="workspace-header"'),
    );
    expect(markup.indexOf('data-slot="workspace-header"')).toBeLessThan(
      markup.indexOf('data-slot="workspace-layout"'),
    );
  });

  test("does not render the legacy workspace right-rail host in the project route", async () => {
    const workspaceTabContentModule =
      await import("../../workspaces/components/workspace-tab-content");
    spyOn(workspaceTabContentModule, "WorkspaceTabContent").mockImplementation((() =>
      createElement("main", { "data-slot": "workspace-layout" }, "Workspace Layout")) as never);

    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(
      ProjectRoute,
      {},
      "/projects/project_1?workspace=workspace_1",
    );

    expect(markup).not.toContain("workspace-right-rail");
    expect(markup).not.toContain("Resize workspace panel");
  });
});
