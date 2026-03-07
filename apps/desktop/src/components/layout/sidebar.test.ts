import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  Sidebar,
  getSidebarHeaderClassName,
  shouldInsetSidebarHeaderForWindowControls,
} from "./sidebar";

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
  test("renders history actions in the header before the add-project button", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Sidebar, {
          isLoading: false,
          projects: [],
          workspacesByProjectId: {},
          selectedProjectId: null,
          selectedWorkspaceId: null,
          width: 256,
          onSelectProject: () => {},
          onSelectWorkspace: () => {},
          onAddProject: () => {},
          onCreateWorkspace: () => {},
          onOpenSettings: () => {},
        }),
      ),
    );

    const backIndex = markup.indexOf('aria-label="Go back"');
    const forwardIndex = markup.indexOf('aria-label="Go forward"');
    const addProjectIndex = markup.indexOf('title="Add project"');

    expect(backIndex).toBeGreaterThan(-1);
    expect(forwardIndex).toBeGreaterThan(backIndex);
    expect(addProjectIndex).toBeGreaterThan(forwardIndex);
  });

  test("uses the standard panel surface token for the left rail", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Sidebar, {
          isLoading: false,
          projects: [],
          workspacesByProjectId: {},
          selectedProjectId: null,
          selectedWorkspaceId: null,
          width: 256,
          onSelectProject: () => {},
          onSelectWorkspace: () => {},
          onAddProject: () => {},
          onCreateWorkspace: () => {},
          onOpenSettings: () => {},
        }),
      ),
    );

    expect(markup).toContain("bg-[var(--panel)]");
    expect(markup).toContain("text-[var(--foreground)]");
  });
});
