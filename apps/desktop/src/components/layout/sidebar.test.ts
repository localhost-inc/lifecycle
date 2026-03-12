import { describe, expect, test } from "bun:test";
import { SidebarProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TerminalResponseReadyProvider } from "../../features/terminals/state/terminal-response-ready-provider";
import {
  Sidebar,
  createWorkspaceSelectionHandler,
  getSidebarHeaderClassName,
  shouldInsetSidebarHeaderForWindowControls,
} from "./sidebar";

const project = {
  id: "project_1",
  path: "/tmp/project_1",
  name: "Lifecycle",
  manifestPath: "lifecycle.json",
  manifestValid: true,
  organizationId: undefined,
  repositoryId: undefined,
  createdAt: "2026-03-01T12:00:00.000Z",
  updatedAt: "2026-03-07T12:00:00.000Z",
};

const workspace = {
  id: "workspace_1",
  project_id: "project_1",
  name: "ion-junction",
  kind: "managed" as const,
  source_ref: "lifecycle/ion-junction",
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

describe("shouldInsetSidebarHeaderForWindowControls", () => {
  test("reserves the traffic-light inset for macOS Tauri windows", () => {
    expect(shouldInsetSidebarHeaderForWindowControls("macOS", true)).toBeTrue();
    expect(shouldInsetSidebarHeaderForWindowControls("MacIntel", true)).toBeTrue();
  });

  test("skips the inset outside macOS overlay windows", () => {
    expect(shouldInsetSidebarHeaderForWindowControls("Windows", true)).toBeFalse();
    expect(shouldInsetSidebarHeaderForWindowControls("Linux", true)).toBeFalse();
    expect(shouldInsetSidebarHeaderForWindowControls("macOS", false)).toBeFalse();
  });
});

describe("getSidebarHeaderClassName", () => {
  test("stacks the macOS inset header so the top row can align with traffic lights", () => {
    expect(getSidebarHeaderClassName(true)).toContain("flex-col");
    expect(getSidebarHeaderClassName(true)).toContain("pt-4");
  });

  test("keeps the compact header outside macOS traffic-light layouts", () => {
    expect(getSidebarHeaderClassName(false)).toContain("py-3");
  });
});

describe("Sidebar", () => {
  test("workspace selection only navigates and does not eagerly acknowledge workspace readiness", () => {
    const selectedWorkspaceIds: string[] = [];
    const handleSelect = createWorkspaceSelectionHandler("workspace_1", (workspaceId) => {
      selectedWorkspaceIds.push(workspaceId);
    });

    handleSelect();

    expect(selectedWorkspaceIds).toEqual(["workspace_1"]);
  });

  test("renders history actions in the header before the add-project button", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          SidebarProvider,
          {
            sidebarWidth: "256px",
          },
          createElement(
            TerminalResponseReadyProvider,
            null,
            createElement(Sidebar, {
              isLoading: false,
              projects: [],
              workspacesByProjectId: {},
              selectedProjectId: null,
              selectedWorkspaceId: null,
              onSelectProject: () => {},
              onSelectWorkspace: () => {},
              onAddProject: () => {},
              onCreateWorkspace: () => {},
              onRemoveProject: () => {},
              onDestroyWorkspace: () => {},
              onOpenSettings: () => {},
            }),
          ),
        ),
      ),
    );

    const backIndex = markup.indexOf('aria-label="Go back"');
    const forwardIndex = markup.indexOf('aria-label="Go forward"');
    const addProjectIndex = markup.indexOf('title="Add project"');

    expect(backIndex).toBeGreaterThan(-1);
    expect(forwardIndex).toBeGreaterThan(backIndex);
    expect(addProjectIndex).toBeGreaterThan(forwardIndex);
  });

  test("uses the shared sidebar token surface for the left rail", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          SidebarProvider,
          {
            sidebarWidth: "256px",
          },
          createElement(
            TerminalResponseReadyProvider,
            null,
            createElement(Sidebar, {
              isLoading: false,
              projects: [],
              workspacesByProjectId: {},
              selectedProjectId: null,
              selectedWorkspaceId: null,
              onSelectProject: () => {},
              onSelectWorkspace: () => {},
              onAddProject: () => {},
              onCreateWorkspace: () => {},
              onRemoveProject: () => {},
              onDestroyWorkspace: () => {},
              onOpenSettings: () => {},
            }),
          ),
        ),
      ),
    );

    expect(markup).toContain("bg-[var(--sidebar-background)]");
    expect(markup).toContain("text-[var(--sidebar-foreground)]");
  });

  test("uses a thicker neutral rail for workspace branches", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          SidebarProvider,
          {
            sidebarWidth: "256px",
          },
          createElement(
            TerminalResponseReadyProvider,
            null,
            createElement(Sidebar, {
              isLoading: false,
              projects: [project],
              workspacesByProjectId: {
                [project.id]: [workspace],
              },
              selectedProjectId: null,
              selectedWorkspaceId: null,
              onSelectProject: () => {},
              onSelectWorkspace: () => {},
              onAddProject: () => {},
              onCreateWorkspace: () => {},
              onRemoveProject: () => {},
              onDestroyWorkspace: () => {},
              onOpenSettings: () => {},
            }),
          ),
        ),
      ),
    );

    expect(markup).toContain("border-left-width:2px");
    expect(markup).toContain("border-left-color:var(--border)");
  });
});
