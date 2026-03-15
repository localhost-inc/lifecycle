import type { ProjectRecord } from "@lifecycle/contracts";
import { ThemeProvider } from "@lifecycle/ui";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { AuthSession } from "../../auth/auth-session";
import { ProjectSwitcherStrip } from "./project-switcher-strip";

const projects: ProjectRecord[] = [
  {
    createdAt: "2026-03-14T10:00:00.000Z",
    id: "project_1",
    manifestPath: "/tmp/lifecycle/lifecycle.json",
    manifestValid: true,
    name: "Lifecycle",
    path: "/tmp/lifecycle",
    updatedAt: "2026-03-14T10:00:00.000Z",
  },
  {
    createdAt: "2026-03-14T10:00:00.000Z",
    id: "project_2",
    manifestPath: "/tmp/kin/lifecycle.json",
    manifestValid: true,
    name: "Kin",
    path: "/tmp/kin",
    updatedAt: "2026-03-14T10:00:00.000Z",
  },
];

const loggedInAuthSession: AuthSession = {
  identity: {
    avatarUrl: "https://avatars.githubusercontent.com/u/14184138?v=4",
    displayName: "Kyle Alwyn",
    handle: "kylealwyn",
  },
  message: null,
  provider: "github",
  source: "local_cli",
  state: "logged_in",
};

describe("ProjectSwitcherStrip", () => {
  test("renders the project switcher strip with a leading Personal context control and project list", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(MemoryRouter, {
          children: createElement(ProjectSwitcherStrip, {
            activeProjectId: "project_2",
            activeContextName: "Personal",
            authSession: loggedInAuthSession,
            onAddProject: () => {},
            onOpenSettings: () => {},
            projects,
            readyProjectIds: new Set<string>(),
          }),
        }),
      }),
    );

    expect(markup).toContain('data-slot="project-switcher-strip"');
    expect(markup).not.toContain("bg-[var(--surface)]");
    expect(markup).toContain('data-slot="project-switcher-context"');
    expect(markup).toContain('aria-label="Open Personal context"');
    expect(markup).toContain(">Personal<");
    expect(markup).toContain('aria-label="Open project Lifecycle"');
    expect(markup).toContain('href="/projects/project_1"');
    expect(markup).toContain('aria-label="Open project Kin"');
    expect(markup).toContain('href="/projects/project_2"');
    expect(markup).toContain('aria-label="Add project"');
    expect(markup).toContain("kylealwyn");
    expect(markup).toContain('src="https://avatars.githubusercontent.com/u/14184138?v=4"');
    expect(markup.indexOf('data-slot="project-switcher-context"')).toBeLessThan(
      markup.indexOf('href="/projects/project_1"'),
    );
    expect(markup.indexOf('href="/projects/project_1"')).toBeLessThan(
      markup.indexOf('href="/projects/project_2"'),
    );
  });

  test("renders a response-ready indicator for projects with ready workspaces", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(MemoryRouter, {
          children: createElement(ProjectSwitcherStrip, {
            activeProjectId: "project_1",
            activeContextName: "Personal",
            authSession: loggedInAuthSession,
            onAddProject: () => {},
            onOpenSettings: () => {},
            projects,
            readyProjectIds: new Set(["project_1"]),
          }),
        }),
      }),
    );

    expect(markup.match(/aria-label="Response ready"/g)?.length ?? 0).toBe(1);
    expect(markup).toContain("right-1.5 top-1/2");
  });
});
