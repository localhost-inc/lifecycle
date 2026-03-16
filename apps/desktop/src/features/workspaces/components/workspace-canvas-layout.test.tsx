import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@lifecycle/ui";
import { QueryProvider } from "../../../query";
import { SettingsProvider } from "../../settings/state/app-settings-provider";

function withTheme(element: ReturnType<typeof createElement>) {
  return createElement(ThemeProvider, {
    children: element,
    defaultPreference: { theme: "light" },
    storageKey: "lifecycle.desktop.theme.test",
  });
}

describe("WorkspaceCanvas layout", () => {
  afterEach(() => {
    mock.restore();
  });

  test("renders pane headers with a dedicated tab strip region beside the right-side controls", async () => {
    const terminalHooksModule = await import("../../terminals/hooks");
    const responseReadyModule =
      await import("../../terminals/state/terminal-response-ready-provider");
    const panelsModule = await import("./workspace-pane-content");
    const tabBarModule = await import("./workspace-pane-tab-bar");

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
    spyOn(tabBarModule, "WorkspacePaneTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspacePaneContent").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-pane-content" }, "Panels")) as never);

    const { WorkspaceCanvas } = await import("./workspace-canvas");
    const markup = renderToStaticMarkup(
      withTheme(
        createElement(SettingsProvider, {
          children: createElement(QueryProvider, {
            children: createElement(WorkspaceCanvas, {
              openDocumentRequest: null,
              snapshotTerminals: [],
              workspaceId: "workspace-1",
            }),
          }),
        }),
      ),
    );

    expect(markup).toContain('data-workspace-pane-header="true"');
    expect(markup).toContain('class="flex h-9 items-stretch gap-1 shadow-[inset_0_-1px_0_var(--border)]');
    expect(markup).toContain('data-slot="workspace-tab-bar"');
    expect(markup).toContain('class="flex shrink-0 items-center gap-px"');
  });

  test("renders a visible vertical resize gutter between side-by-side pane groups", async () => {
    const panelsModule = await import("./workspace-pane-content");
    const tabBarModule = await import("./workspace-pane-tab-bar");

    spyOn(tabBarModule, "WorkspacePaneTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspacePaneContent").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-pane-content" }, "Panels")) as never);

    const { WorkspacePaneTree } = await import("./workspace-pane-tree");
    const markup = renderToStaticMarkup(
      withTheme(
        createElement(WorkspacePaneTree, {
          activePaneId: "pane-root",
          creatingSelection: null,
          dimInactivePanes: false,
          documents: [],
          fileSessionsByTabKey: {},
          inactivePaneOpacity: 0.65,
          onCloseDocumentTab: () => {},
          onClosePane: () => {},
          onCloseRuntimeTab: async () => {},
          onCreateTerminal: async () => {},
          onFileSessionStateChange: () => {},
          onLaunchSurface: () => {},
          onMoveTabToPane: () => {},
          onOpenFile: () => {},
          onRenameRuntimeTab: async () => {},
          onSelectPane: () => {},
          onSelectTab: () => {},
          onReconcilePaneVisibleTabOrder: () => {},
          onSetSplitRatio: () => {},
          onSplitPane: () => {},
          onTabViewStateChange: () => {},
          paneCount: 2,
          renderedActiveTabKeyByPaneId: {
            "pane-2": null,
            "pane-root": null,
          },
          rootPane: {
            direction: "row",
            first: {
              id: "pane-root",
              kind: "leaf",
            },
            id: "split-1",
            kind: "split",
            ratio: 0.5,
            second: {
              id: "pane-2",
              kind: "leaf",
            },
          },
          surfaceActions: [],
          terminals: [],
          viewStateByTabKey: {},
          visibleTabsByPaneId: {
            "pane-2": [],
            "pane-root": [],
          },
          paneIdsWaitingForSelectedRuntimeTab: new Set<string>(),
          workspaceId: "workspace-1",
        }),
      ),
    );

    expect(markup).toContain('aria-orientation="vertical"');
    expect(markup).toContain('data-workspace-split-resizer="row"');
    expect(markup).toContain('class="relative w-0 shrink-0"');
    expect(markup).toContain(
      'class="group absolute inset-y-0 -left-2 z-20 flex w-4 touch-none cursor-col-resize justify-center outline-none',
    );
    expect(markup).toContain("group-focus-visible:bg-[var(--ring)]");
    expect(markup).toContain("cursor-col-resize");
  });

  test("stretches nested split groups to fill their allocated split space", async () => {
    const panelsModule = await import("./workspace-pane-content");
    const tabBarModule = await import("./workspace-pane-tab-bar");

    spyOn(tabBarModule, "WorkspacePaneTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspacePaneContent").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-pane-content" }, "Panels")) as never);

    const { WorkspacePaneTree } = await import("./workspace-pane-tree");
    const markup = renderToStaticMarkup(
      withTheme(
        createElement(WorkspacePaneTree, {
          activePaneId: "pane-1",
          creatingSelection: null,
          dimInactivePanes: false,
          documents: [],
          fileSessionsByTabKey: {},
          inactivePaneOpacity: 0.65,
          onCloseDocumentTab: () => {},
          onClosePane: () => {},
          onCloseRuntimeTab: async () => {},
          onCreateTerminal: async () => {},
          onFileSessionStateChange: () => {},
          onLaunchSurface: () => {},
          onMoveTabToPane: () => {},
          onOpenFile: () => {},
          onRenameRuntimeTab: async () => {},
          onSelectPane: () => {},
          onSelectTab: () => {},
          onReconcilePaneVisibleTabOrder: () => {},
          onSetSplitRatio: () => {},
          onSplitPane: () => {},
          onTabViewStateChange: () => {},
          paneCount: 3,
          renderedActiveTabKeyByPaneId: {
            "pane-1": null,
            "pane-2": null,
            "pane-3": null,
          },
          rootPane: {
            direction: "column",
            first: {
              direction: "row",
              first: {
                id: "pane-1",
                kind: "leaf",
              },
              id: "split-top",
              kind: "split",
              ratio: 0.5,
              second: {
                id: "pane-2",
                kind: "leaf",
              },
            },
            id: "split-root",
            kind: "split",
            ratio: 0.5,
            second: {
              id: "pane-3",
              kind: "leaf",
            },
          },
          surfaceActions: [],
          terminals: [],
          viewStateByTabKey: {},
          visibleTabsByPaneId: {
            "pane-1": [],
            "pane-2": [],
            "pane-3": [],
          },
          paneIdsWaitingForSelectedRuntimeTab: new Set<string>(),
          workspaceId: "workspace-1",
        }),
      ),
    );

    expect(markup).toContain('class="flex min-h-0 min-w-0 shrink-0 overflow-hidden"');
    expect(markup).toContain('class="flex min-h-0 min-w-0 flex-1 overflow-hidden"');
  });

  test("dims inactive panes to the configured opacity", async () => {
    const panelsModule = await import("./workspace-pane-content");
    const tabBarModule = await import("./workspace-pane-tab-bar");

    spyOn(tabBarModule, "WorkspacePaneTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspacePaneContent").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-pane-content" }, "Panels")) as never);

    const { WorkspacePaneTree } = await import("./workspace-pane-tree");
    const markup = renderToStaticMarkup(
      withTheme(
        createElement(WorkspacePaneTree, {
          activePaneId: "pane-root",
          creatingSelection: null,
          dimInactivePanes: true,
          documents: [],
          fileSessionsByTabKey: {},
          inactivePaneOpacity: 0.45,
          onCloseDocumentTab: () => {},
          onClosePane: () => {},
          onCloseRuntimeTab: async () => {},
          onCreateTerminal: async () => {},
          onFileSessionStateChange: () => {},
          onLaunchSurface: () => {},
          onMoveTabToPane: () => {},
          onOpenFile: () => {},
          onRenameRuntimeTab: async () => {},
          onSelectPane: () => {},
          onSelectTab: () => {},
          onReconcilePaneVisibleTabOrder: () => {},
          onSetSplitRatio: () => {},
          onSplitPane: () => {},
          onTabViewStateChange: () => {},
          paneCount: 2,
          renderedActiveTabKeyByPaneId: {
            "pane-2": null,
            "pane-root": null,
          },
          rootPane: {
            direction: "row",
            first: {
              id: "pane-root",
              kind: "leaf",
            },
            id: "split-1",
            kind: "split",
            ratio: 0.5,
            second: {
              id: "pane-2",
              kind: "leaf",
            },
          },
          surfaceActions: [],
          terminals: [],
          viewStateByTabKey: {},
          visibleTabsByPaneId: {
            "pane-2": [],
            "pane-root": [],
          },
          paneIdsWaitingForSelectedRuntimeTab: new Set<string>(),
          workspaceId: "workspace-1",
        }),
      ),
    );

    expect(markup).toContain('data-workspace-pane-id="pane-2"');
    expect(markup).toContain('style="opacity:0.45"');
    expect(markup).toContain("transition-opacity duration-150");
  });
});
