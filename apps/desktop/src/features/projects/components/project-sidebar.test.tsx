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
    expect(markup).toContain('data-slot="project-sidebar-header"');
    expect(markup).toContain("flex h-10 items-center border-b border-[var(--border)] px-3");
    expect(markup.match(/Create workspace for Lifecycle/g)?.length ?? 0).toBe(1);
  });
});
