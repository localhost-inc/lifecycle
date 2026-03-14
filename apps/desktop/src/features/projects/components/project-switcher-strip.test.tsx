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
  test("renders the project switcher strip with the project list and auth settings pill", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(MemoryRouter, {
          children: createElement(ProjectSwitcherStrip, {
            activeProjectId: "project_2",
            authSession: loggedInAuthSession,
            onAddProject: () => {},
            onOpenSettings: () => {},
            projects,
          }),
        }),
      }),
    );

    expect(markup).toContain('data-slot="project-switcher-strip"');
    expect(markup).toContain('aria-label="Open project Lifecycle"');
    expect(markup).toContain('href="/projects/project_1"');
    expect(markup).toContain('aria-label="Open project Kin"');
    expect(markup).toContain('href="/projects/project_2"');
    expect(markup).toContain('aria-label="Add project"');
    expect(markup).toContain('aria-label="Open settings"');
    expect(markup).toContain('data-slot="project-switcher-auth"');
    expect(markup).toContain("kylealwyn");
    expect(markup).toContain('src="https://avatars.githubusercontent.com/u/14184138?v=4"');
    expect(markup.indexOf('href="/projects/project_1"')).toBeLessThan(
      markup.indexOf('href="/projects/project_2"'),
    );
  });
});
