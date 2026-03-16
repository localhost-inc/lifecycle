import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { AppShellOutletContext } from "../../../components/layout/app-shell-context";
import { TerminalResponseReadyProvider } from "../../terminals/state/terminal-response-ready-provider";

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
    onOpenSettings: () => {},
    onOpenWorkspace: () => {},
    onRemoveProject: async () => {},
    projectCatalog: undefined,
    projects: [project],
    sidebarCollapsed: false,
    workspacesByProjectId: {
      [project.id]: [workspace],
    },
    ...contextOverrides,
  };

  function OutletContextBoundary() {
    return <Outlet context={context} />;
  }

  // Render an index child route stub so the Outlet inside ProjectRoute can render something
  function OverviewStub() {
    return <main data-slot="project-page">Overview Surface</main>;
  }

  function WorkspaceStub() {
    return <main data-slot="workspace-layout">Workspace Layout</main>;
  }

  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      storageKey: "test.theme",
      children: createElement(TerminalResponseReadyProvider, {
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
                createElement(Route, { index: true, element: createElement(OverviewStub) }),
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
  afterEach(() => {
    mock.restore();
  });

  test("renders nav bar and project layout with child route content", async () => {
    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(ProjectRoute);

    expect(markup).toContain('data-slot="project-nav-bar"');
    expect(markup).toContain('data-slot="project-shell"');
    expect(markup).toContain('data-slot="project-page"');
    expect(markup.indexOf('data-slot="project-nav-bar"')).toBeLessThan(
      markup.indexOf('data-slot="project-page"'),
    );
  });

  test("renders workspace action icons inside the nav bar for workspace routes", async () => {
    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(
      ProjectRoute,
      {},
      "/projects/project_1/workspaces/workspace_1",
    );

    expect(markup).toContain('data-slot="project-nav-bar"');
    expect(markup).toContain('data-slot="workspace-layout"');
    expect(markup).toContain('aria-label="Fork workspace"');
    expect(markup).toContain('aria-label="Destroy workspace"');
    expect(markup).not.toContain('title="Toggle extension panel"');

    const navBarStart = markup.indexOf('data-slot="project-nav-bar"');
    const forkIndex = markup.indexOf('aria-label="Fork workspace"');
    const workspaceStart = markup.indexOf('data-slot="workspace-layout"');
    expect(navBarStart).toBeLessThan(forkIndex);
    expect(forkIndex).toBeLessThan(workspaceStart);
  });

  test("does not render a divider after the navigation controls", async () => {
    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(ProjectRoute);

    expect(markup).not.toContain('class="flex shrink-0 items-center border-r border-[var(--border)]"');
  });

  test("renders response-ready indicators in the workspace nav link from shared readiness state", async () => {
    const responseReadyModule =
      await import("../../terminals/state/terminal-response-ready-provider");
    spyOn(responseReadyModule, "useTerminalResponseReady").mockReturnValue({
      clearTerminalResponseReady: () => {},
      clearWorkspaceResponseReady: () => {},
      hasWorkspaceResponseReady: (workspaceId: string) => workspaceId === "workspace_1",
      hasWorkspaceRunningTurn: () => false,
      isTerminalResponseReady: () => false,
      isTerminalTurnRunning: () => false,
    });

    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(
      ProjectRoute,
      {},
      "/projects/project_1/workspaces/workspace_1",
    );

    expect(markup.match(/aria-label="Response ready"/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  test("renders running indicators in the workspace nav link from shared turn state", async () => {
    const responseReadyModule =
      await import("../../terminals/state/terminal-response-ready-provider");
    spyOn(responseReadyModule, "useTerminalResponseReady").mockReturnValue({
      clearTerminalResponseReady: () => {},
      clearWorkspaceResponseReady: () => {},
      hasWorkspaceResponseReady: () => false,
      hasWorkspaceRunningTurn: (workspaceId: string) => workspaceId === "workspace_1",
      isTerminalResponseReady: () => false,
      isTerminalTurnRunning: () => false,
    });

    const { ProjectRoute } = await import("./project-route");

    const markup = renderProjectRoute(
      ProjectRoute,
      {},
      "/projects/project_1/workspaces/workspace_1",
    );

    expect(markup.match(/data-slot="spinner"/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});
