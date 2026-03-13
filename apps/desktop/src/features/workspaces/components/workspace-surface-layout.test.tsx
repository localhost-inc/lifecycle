import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryProvider } from "../../../query";

describe("WorkspaceSurface layout", () => {
  afterEach(() => {
    mock.restore();
  });

  test("renders pane headers flush on the left edge while preserving right-side controls", async () => {
    const hooksModule = await import("../hooks");
    const terminalHooksModule = await import("../../terminals/hooks");
    const responseReadyModule =
      await import("../../terminals/state/terminal-response-ready-provider");
    const panelsModule = await import("./workspace-surface-panels");
    const tabBarModule = await import("./workspace-surface-tab-bar");

    spyOn(hooksModule, "useWorkspaceActivity").mockReturnValue({ data: [] } as never);
    spyOn(terminalHooksModule, "useWorkspaceTerminals").mockReturnValue({
      data: [],
      isLoading: false,
      status: "ready",
    } as never);
    spyOn(responseReadyModule, "useTerminalResponseReady").mockReturnValue({
      clearTerminalResponseReady: () => {},
      isTerminalResponseReady: () => false,
      isTerminalTurnRunning: () => false,
    } as never);
    spyOn(tabBarModule, "WorkspaceSurfaceTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspaceSurfacePanels").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-surface-panels" }, "Panels")) as never);

    const { WorkspaceSurface } = await import("./workspace-surface");
    const markup = renderToStaticMarkup(
      createElement(QueryProvider, {
        children: createElement(WorkspaceSurface, {
          openDocumentRequest: null,
          snapshotTerminals: [],
          workspaceId: "workspace-1",
        }),
      }),
    );

    expect(markup).toContain('class="flex items-center gap-2 border-b');
    expect(markup).toContain('data-slot="workspace-tab-bar"');
    expect(markup).not.toContain("px-3");
  });

  test("renders a visible vertical resize gutter between side-by-side pane groups", async () => {
    const panelsModule = await import("./workspace-surface-panels");
    const tabBarModule = await import("./workspace-surface-tab-bar");

    spyOn(tabBarModule, "WorkspaceSurfaceTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspaceSurfacePanels").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-surface-panels" }, "Panels")) as never);

    const { WorkspaceSurfacePaneTree } = await import("./workspace-surface-pane-tree");
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfacePaneTree, {
        activePaneId: "pane-root",
        activity: [],
        creatingSelection: null,
        documents: [],
        fileSessionsByTabKey: {},
        onCloseDocumentTab: () => {},
        onClosePane: () => {},
        onCloseRuntimeTab: async () => {},
        onCreateTerminal: async () => {},
        onFileSessionStateChange: () => {},
        onLaunchSurface: () => {},
        onMoveTabToPane: () => {},
        onOpenFile: () => {},
        onOpenLauncher: () => {},
        onOpenTerminal: () => {},
        onRenameRuntimeTab: async () => {},
        onSelectPane: () => {},
        onSelectTab: () => {},
        onSetPaneTabOrder: () => {},
        onSetSplitRatio: () => {},
        onSplitPane: () => {},
        onTabViewStateChange: () => {},
        paneCount: 2,
        resolvedActiveTabKeyByPaneId: {
          "pane-2": null,
          "pane-root": null,
        },
        rootPane: {
          direction: "row",
          first: {
            activeTabKey: null,
            id: "pane-root",
            kind: "leaf",
            tabOrderKeys: [],
          },
          id: "split-1",
          kind: "split",
          ratio: 0.5,
          second: {
            activeTabKey: null,
            id: "pane-2",
            kind: "leaf",
            tabOrderKeys: [],
          },
        },
        sessionHistory: [],
        surfaceActions: [],
        terminals: [],
        viewStateByTabKey: {},
        visibleTabsByPaneId: {
          "pane-2": [],
          "pane-root": [],
        },
        waitingForRuntimePaneIds: new Set<string>(),
        workspaceId: "workspace-1",
      }),
    );

    expect(markup).toContain('aria-orientation="vertical"');
    expect(markup).toContain('data-workspace-split-resizer="row"');
    expect(markup).toContain('class="pointer-events-none absolute inset-y-0 z-20"');
    expect(markup).toContain('style="left:50%"');
    expect(markup).toContain("cursor-col-resize");
  });
});
