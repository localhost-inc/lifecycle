import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getWorkspaceActiveTabScrollLeft,
  hasStartedWorkspaceTabDrag,
  WorkspacePaneTabBar,
} from "./workspace-pane-tab-bar";

describe("WorkspacePaneTabBar", () => {
  test("renders caller-provided leading content for surface tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: "terminal:term-1",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},

        onSelectTab: () => {},
        renderTabLeading: (tab) =>
          createElement("span", { "data-slot": "custom-leading" }, `lead:${tab.key}`),
        visibleTabs: [
          {
            harnessProvider: "claude",
            key: "terminal:term-1",
            kind: "terminal",
            label: "Claude",
            launchType: "harness",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
        ],
      }),
    );

    expect(markup).toContain('data-slot="custom-leading"');
    expect(markup).toContain("lead:terminal:term-1");
  });

  test("renders workspace tab items without depending on the shared compact tab primitive", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: "terminal:term-1",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},
        onSelectTab: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
        ],
      }),
    );

    expect(markup).toContain("h-full");
    expect(markup).toContain("border-x");
    expect(markup).toContain("bg-[var(--background)]");
    expect(markup).toContain("text-sm");
    expect(markup).toContain("font-semibold");
    expect(markup).not.toContain("shadow-[");
  });

  test("hides the horizontal scrollbar and reserves a right gutter for the fade", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: "terminal:term-1",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},
        onSelectTab: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
          {
            key: "terminal:term-2",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 2",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-2",
          },
        ],
      }),
    );

    expect(markup).toContain("padding-right:24px");
    expect(markup).toContain("scrollbar-width:none");
    expect(markup).toContain("-ms-overflow-style:none");
    expect(markup).toContain("z-[1]");
    expect(markup).not.toContain("right-0 z-10");
  });

  test("uses standalone shells instead of legacy tab separators", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: "terminal:term-3",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},
        onSelectTab: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
          {
            key: "terminal:term-2",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 2",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-2",
          },
          {
            key: "terminal:term-3",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 3",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-3",
          },
        ],
      }),
    );

    expect(markup).not.toContain('data-slot="workspace-tab-separator"');
    expect(markup).toContain("gap-0");
  });

  test("does not render a status dot for a plain terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: "terminal:term-1",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},

        onSelectTab: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "detached",
            terminalId: "term-1",
          },
        ],
      }),
    );

    expect(markup).not.toContain('title="detached"');
    expect(markup).not.toContain('aria-label="Response ready"');
  });

  test("does not render the floating ready badge for the active terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: "terminal:term-1",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},

        onSelectTab: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: true,
            status: "detached",
            terminalId: "term-1",
          },
        ],
      }),
    );

    expect(markup).not.toContain('aria-label="Response ready"');
    expect(markup).not.toContain("pointer-events-none absolute right-3 top-1.5");
    expect(markup).not.toContain('title="detached"');
  });

  test("renders the floating ready badge for an inactive ready terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: "terminal:term-2",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},

        onSelectTab: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: true,
            status: "detached",
            terminalId: "term-1",
          },
          {
            key: "terminal:term-2",
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 2",
            launchType: "shell",
            responseReady: false,
            status: "detached",
            terminalId: "term-2",
          },
        ],
      }),
    );

    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).toContain("pointer-events-none absolute right-3 top-1.5");
    expect(markup).not.toContain('title="detached"');
  });
});

describe("getWorkspaceActiveTabScrollLeft", () => {
  test("keeps the scroll position when the active tab is fully visible", () => {
    expect(
      getWorkspaceActiveTabScrollLeft(
        {
          clientWidth: 320,
          scrollLeft: 48,
        },
        {
          offsetLeft: 72,
          offsetWidth: 96,
        },
      ),
    ).toBeNull();
  });

  test("scrolls right when the active tab would land under the fade", () => {
    expect(
      getWorkspaceActiveTabScrollLeft(
        {
          clientWidth: 240,
          scrollLeft: 0,
        },
        {
          offsetLeft: 200,
          offsetWidth: 80,
        },
      ),
    ).toBe(64);
  });

  test("scrolls left when the active tab sits before the current viewport", () => {
    expect(
      getWorkspaceActiveTabScrollLeft(
        {
          clientWidth: 240,
          scrollLeft: 80,
        },
        {
          offsetLeft: 32,
          offsetWidth: 72,
        },
      ),
    ).toBe(32);
  });
});

describe("hasStartedWorkspaceTabDrag", () => {
  test("starts a drag from vertical movement, not only horizontal movement", () => {
    expect(hasStartedWorkspaceTabDrag(0, 7)).toBe(true);
    expect(hasStartedWorkspaceTabDrag(5, 0)).toBe(false);
  });
});
