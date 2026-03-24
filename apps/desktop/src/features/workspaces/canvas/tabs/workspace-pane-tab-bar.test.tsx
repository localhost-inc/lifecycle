import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { terminalTabKey } from "@/features/workspaces/state/workspace-canvas-state";
import {
  getWorkspaceActiveTabScrollLeft,
  hasStartedWorkspaceTabDrag,
  WorkspacePaneTabBar,
} from "@/features/workspaces/canvas/tabs/workspace-pane-tab-bar";
import type { TerminalTab } from "@/features/workspaces/canvas/workspace-canvas-tabs";

function createTerminalTab(id: string, overrides: Partial<TerminalTab> = {}) {
  return {
    key: terminalTabKey(id),
    kind: "terminal" as const,
    label: `Terminal ${id}`,
    launchType: "shell" as const,
    responseReady: false,
    status: "active" as const,
    terminalId: id,
    ...overrides,
  };
}

function createTabBarProps(
  tabs: Array<{
    dirty: boolean;
    tab: ReturnType<typeof createTerminalTab>;
  }>,
  activeTabKey: string | null = tabs[0]?.tab.key ?? null,
) {
  return {
    model: {
      activeTabKey,
      dragPreview: null,
      paneId: "pane-root",
      tabs,
    },
    onCloseDocumentTab: () => {},
    onCloseTerminalTab: async () => {},
    onRenameTerminalTab: async () => {},
    onSelectTab: () => {},
    onTabDrag: () => {},
    onTabDragCommit: () => {},
  };
}

describe("WorkspacePaneTabBar", () => {
  test("renders workspace tab items with the current workspace chip styling", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneTabBar,
        createTabBarProps(
          [{ dirty: false, tab: createTerminalTab("term-1") }],
          terminalTabKey("term-1"),
        ),
      ),
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
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneTabBar,
        createTabBarProps(
          [
            { dirty: false, tab: createTerminalTab("term-1") },
            { dirty: false, tab: createTerminalTab("term-2") },
          ],
          terminalTabKey("term-1"),
        ),
      ),
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
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneTabBar,
        createTabBarProps(
          [
            { dirty: false, tab: createTerminalTab("term-1") },
            { dirty: false, tab: createTerminalTab("term-2") },
            { dirty: false, tab: createTerminalTab("term-3") },
          ],
          terminalTabKey("term-3"),
        ),
      ),
    );

    expect(markup).not.toContain('data-slot="workspace-tab-separator"');
    expect(markup).toContain("gap-0");
  });

  test("does not render a status dot for a plain terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneTabBar,
        createTabBarProps(
          [{ dirty: false, tab: createTerminalTab("term-1", { status: "detached" }) }],
          terminalTabKey("term-1"),
        ),
      ),
    );

    expect(markup).not.toContain('title="detached"');
    expect(markup).not.toContain('aria-label="Response ready"');
  });

  test("renders inline ready indicator for a ready terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneTabBar,
        createTabBarProps(
          [
            {
              dirty: false,
              tab: createTerminalTab("term-1", { responseReady: true, status: "detached" }),
            },
            { dirty: false, tab: createTerminalTab("term-2", { status: "detached" }) },
          ],
          terminalTabKey("term-2"),
        ),
      ),
    );

    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).toContain('data-surface-tab-icon="shell"');
  });

  test("renders shell icon for non-ready terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneTabBar,
        createTabBarProps(
          [{ dirty: false, tab: createTerminalTab("term-1", { status: "detached" }) }],
          terminalTabKey("term-1"),
        ),
      ),
    );

    expect(markup).not.toContain('aria-label="Response ready"');
    expect(markup).toContain('data-surface-tab-icon="shell"');
  });

  test("replaces the shell icon with a spinner while a turn is running", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneTabBar,
        createTabBarProps(
          [{ dirty: false, tab: createTerminalTab("term-1", { running: true }) }],
          terminalTabKey("term-1"),
        ),
      ),
    );

    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('title="Generating response"');
    expect(markup).not.toContain('data-surface-tab-icon="shell"');
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
