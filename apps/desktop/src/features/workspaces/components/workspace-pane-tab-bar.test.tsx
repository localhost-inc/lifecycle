import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { terminalTabKey } from "@/features/workspaces/state/workspace-canvas-state";
import {
  getWorkspaceActiveTabScrollLeft,
  hasStartedWorkspaceTabDrag,
  WorkspacePaneTabBar,
} from "@/features/workspaces/components/workspace-pane-tab-bar";

describe("WorkspacePaneTabBar", () => {
  test("renders caller-provided leading content for surface tabs", () => {
    const firstTerminalTabKey = terminalTabKey("term-1");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: firstTerminalTabKey,
        onCloseDocumentTab: () => {},
        onCloseTerminalTab: async () => {},

        onSelectTab: () => {},
        renderTabLeading: (tab) =>
          createElement("span", { "data-slot": "custom-leading" }, `lead:${tab.key}`),
        visibleTabs: [
          {
            harnessProvider: "claude",
            key: firstTerminalTabKey,
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
    expect(markup).toContain(`lead:${firstTerminalTabKey}`);
  });

  test("renders workspace tab items with the current workspace chip styling", () => {
    const firstTerminalTabKey = terminalTabKey("term-1");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: firstTerminalTabKey,
        onCloseDocumentTab: () => {},
        onCloseTerminalTab: async () => {},
        onSelectTab: () => {},
        visibleTabs: [
          {
            key: firstTerminalTabKey,
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

    expect(markup).toContain(
      "relative flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r border-[var(--border)] px-3",
    );
    expect(markup).toContain("bg-[var(--surface)]");
    expect(markup).toContain("text-[13px]");
    expect(markup).toContain("font-medium");
    expect(markup).toContain("cursor-grab");
  });

  test("hides the horizontal scrollbar, reserves the fade gutter, and insets tabs from the pane edge", () => {
    const firstTerminalTabKey = terminalTabKey("term-1");
    const secondTerminalTabKey = terminalTabKey("term-2");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: firstTerminalTabKey,
        onCloseDocumentTab: () => {},
        onCloseTerminalTab: async () => {},
        onSelectTab: () => {},
        visibleTabs: [
          {
            key: firstTerminalTabKey,
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
          {
            key: secondTerminalTabKey,
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
    expect(markup).toContain("gap-0 overflow-x-auto");
    expect(markup).toContain("border-r");
    expect(markup).toContain("z-[1]");
    expect(markup).not.toContain("right-0 z-10");
  });

  test("uses standalone shells instead of legacy tab separators", () => {
    const firstTerminalTabKey = terminalTabKey("term-1");
    const secondTerminalTabKey = terminalTabKey("term-2");
    const thirdTerminalTabKey = terminalTabKey("term-3");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: thirdTerminalTabKey,
        onCloseDocumentTab: () => {},
        onCloseTerminalTab: async () => {},
        onSelectTab: () => {},
        visibleTabs: [
          {
            key: firstTerminalTabKey,
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
          {
            key: secondTerminalTabKey,
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 2",
            launchType: "shell",
            responseReady: false,
            status: "active",
            terminalId: "term-2",
          },
          {
            key: thirdTerminalTabKey,
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
    const firstTerminalTabKey = terminalTabKey("term-1");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: firstTerminalTabKey,
        onCloseDocumentTab: () => {},
        onCloseTerminalTab: async () => {},

        onSelectTab: () => {},
        visibleTabs: [
          {
            key: firstTerminalTabKey,
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

  test("renders inline ready indicator for a ready terminal tab", () => {
    const firstTerminalTabKey = terminalTabKey("term-1");
    const secondTerminalTabKey = terminalTabKey("term-2");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: secondTerminalTabKey,
        onCloseDocumentTab: () => {},
        onCloseTerminalTab: async () => {},

        onSelectTab: () => {},
        visibleTabs: [
          {
            key: firstTerminalTabKey,
            harnessProvider: null,
            kind: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: true,
            status: "detached",
            terminalId: "term-1",
          },
          {
            key: secondTerminalTabKey,
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
    expect(markup).toContain('data-surface-tab-icon="shell"');
  });

  test("renders shell icon for non-ready terminal tab", () => {
    const firstTerminalTabKey = terminalTabKey("term-1");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: firstTerminalTabKey,
        onCloseDocumentTab: () => {},
        onCloseTerminalTab: async () => {},

        onSelectTab: () => {},
        visibleTabs: [
          {
            key: firstTerminalTabKey,
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

    expect(markup).not.toContain('aria-label="Response ready"');
    expect(markup).toContain('data-surface-tab-icon="shell"');
  });

  test("replaces the terminal icon with a spinner while a turn is running", () => {
    const firstTerminalTabKey = terminalTabKey("term-1");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneTabBar, {
        activeTabKey: firstTerminalTabKey,
        onCloseDocumentTab: () => {},
        onCloseTerminalTab: async () => {},
        onSelectTab: () => {},
        visibleTabs: [
          {
            key: firstTerminalTabKey,
            harnessProvider: "codex",
            kind: "terminal",
            label: "Codex",
            launchType: "harness",
            responseReady: false,
            running: true,
            status: "active",
            terminalId: "term-1",
          },
        ],
      }),
    );

    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('title="Generating response"');
    expect(markup).not.toContain('data-surface-tab-icon="codex"');
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
