import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mockStoreContext } from "@/test/store-mock";
import { ReactQueryProvider } from "@/store/react-query-provider";
import { SettingsProvider } from "@/features/settings/state/settings-provider";

function withConfig(element: ReturnType<typeof createElement>) {
  return createElement(SettingsProvider, { children: element });
}

function createTreeProps(input: any) {
  return {
    actions: {
      closeDocumentTab: () => {},
      closeTerminalTab: async () => {},
      fileSessionStateChange: () => {},
      launchSurface: () => {},
      moveTabToPane: () => {},
      openFile: () => {},
      reconcilePaneVisibleTabOrder: () => {},
      renameTerminalTab: async () => {},
      resetAllSplitRatios: () => {},
      selectPane: () => {},
      selectTab: () => {},
      setSplitRatio: () => {},
      splitPane: () => {},
      tabViewStateChange: () => {},
      toggleZoom: () => {},
    },
    model: {
      dimInactivePanes: input.dimInactivePanes ?? false,
      inactivePaneOpacity: input.inactivePaneOpacity ?? 0.65,
      paneCount: input.paneCount,
      panesById: input.panesById,
      rootPane: input.rootPane,
      surfaceActions: [],
      zoomedTabKey: null,
    },
  };
}

describe("WorkspaceCanvas layout", () => {
  beforeEach(() => mockStoreContext());
  afterEach(() => mock.restore());

  test("renders pane headers with a dedicated tab strip region beside the right-side controls", async () => {
    const terminalHooksModule = await import("../../terminals/hooks");
    const responseReadyModule =
      await import("../../terminals/state/terminal-response-ready-provider");
    const storeModule = await import("@/store");
    const panelsModule = await import("./panes/workspace-pane-content");
    const tabBarModule = await import("./tabs/workspace-pane-tab-bar");

    spyOn(terminalHooksModule, "useWorkspaceTerminals").mockReturnValue([] as never);
    spyOn(storeModule, "useAgentSessions").mockReturnValue([] as never);
    spyOn(storeModule, "useAgentSessionRefresh").mockReturnValue((() => {}) as never);
    spyOn(responseReadyModule, "useTerminalResponseReady").mockReturnValue({
      clearTerminalResponseReady: () => {},
      clearTerminalTurnRunning: () => {},
      isTerminalResponseReady: () => false,
      isTerminalTurnRunning: () => false,
    } as never);
    spyOn(tabBarModule, "WorkspacePaneTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspacePaneContent").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-pane-content" }, "Panels")) as never);

    const { WorkspaceCanvas } = await import("./workspace-canvas");
    const markup = renderToStaticMarkup(
      withConfig(
        createElement(ReactQueryProvider, {
          children: createElement(WorkspaceCanvas, {
            openDocumentRequest: null,
            workspaceId: "workspace-1",
          }),
        }),
      ),
    );

    expect(markup).toContain('data-workspace-pane-header="true"');
    expect(markup).toContain(
      'class="flex h-9 items-stretch gap-1 bg-[var(--background)] shadow-[inset_0_-1px_0_var(--border)]',
    );
    expect(markup).toContain('data-slot="workspace-tab-bar"');
    expect(markup).toContain('class="flex w-[8rem] shrink-0 items-center justify-end gap-px pr-1"');
  });

  test("renders a visible vertical resize gutter between side-by-side pane groups", async () => {
    const panelsModule = await import("./panes/workspace-pane-content");
    const tabBarModule = await import("./tabs/workspace-pane-tab-bar");

    spyOn(tabBarModule, "WorkspacePaneTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspacePaneContent").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-pane-content" }, "Panels")) as never);

    const { WorkspacePaneTree } = await import("./panes/workspace-pane-tree");
    const markup = renderToStaticMarkup(
      withConfig(
        createElement(
          WorkspacePaneTree,
          createTreeProps({
            paneCount: 2,
            panesById: {
              "pane-2": {
                activeSurface: { creatingSelection: null, kind: "launcher" },
                id: "pane-2",
                isActive: false,
                tabBar: { activeTabKey: null, dragPreview: null, paneId: "pane-2", tabs: [] },
              },
              "pane-root": {
                activeSurface: { creatingSelection: null, kind: "launcher" },
                id: "pane-root",
                isActive: true,
                tabBar: {
                  activeTabKey: null,
                  dragPreview: null,
                  paneId: "pane-root",
                  tabs: [],
                },
              },
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
          }),
        ),
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
    const panelsModule = await import("./panes/workspace-pane-content");
    const tabBarModule = await import("./tabs/workspace-pane-tab-bar");

    spyOn(tabBarModule, "WorkspacePaneTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspacePaneContent").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-pane-content" }, "Panels")) as never);

    const { WorkspacePaneTree } = await import("./panes/workspace-pane-tree");
    const markup = renderToStaticMarkup(
      withConfig(
        createElement(
          WorkspacePaneTree,
          createTreeProps({
            paneCount: 3,
            panesById: {
              "pane-1": {
                activeSurface: { creatingSelection: null, kind: "launcher" },
                id: "pane-1",
                isActive: true,
                tabBar: { activeTabKey: null, dragPreview: null, paneId: "pane-1", tabs: [] },
              },
              "pane-2": {
                activeSurface: { creatingSelection: null, kind: "launcher" },
                id: "pane-2",
                isActive: false,
                tabBar: { activeTabKey: null, dragPreview: null, paneId: "pane-2", tabs: [] },
              },
              "pane-3": {
                activeSurface: { creatingSelection: null, kind: "launcher" },
                id: "pane-3",
                isActive: false,
                tabBar: { activeTabKey: null, dragPreview: null, paneId: "pane-3", tabs: [] },
              },
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
          }),
        ),
      ),
    );

    expect(markup).toContain('class="flex min-h-0 min-w-0 shrink-0 overflow-hidden"');
    expect(markup).toContain('class="flex min-h-0 min-w-0 flex-1 overflow-hidden"');
  });

  test("dims inactive panes to the configured opacity", async () => {
    const panelsModule = await import("./panes/workspace-pane-content");
    const tabBarModule = await import("./tabs/workspace-pane-tab-bar");

    spyOn(tabBarModule, "WorkspacePaneTabBar").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-tab-bar" }, "Tabs")) as never);
    spyOn(panelsModule, "WorkspacePaneContent").mockImplementation((() =>
      createElement("div", { "data-slot": "workspace-pane-content" }, "Panels")) as never);

    const { WorkspacePaneTree } = await import("./panes/workspace-pane-tree");
    const markup = renderToStaticMarkup(
      withConfig(
        createElement(
          WorkspacePaneTree,
          createTreeProps({
            dimInactivePanes: true,
            inactivePaneOpacity: 0.45,
            paneCount: 2,
            panesById: {
              "pane-2": {
                activeSurface: { creatingSelection: null, kind: "launcher" },
                id: "pane-2",
                isActive: false,
                tabBar: { activeTabKey: null, dragPreview: null, paneId: "pane-2", tabs: [] },
              },
              "pane-root": {
                activeSurface: { creatingSelection: null, kind: "launcher" },
                id: "pane-root",
                isActive: true,
                tabBar: {
                  activeTabKey: null,
                  dragPreview: null,
                  paneId: "pane-root",
                  tabs: [],
                },
              },
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
          }),
        ),
      ),
    );

    expect(markup).toContain('data-workspace-pane-id="pane-2"');
    expect(markup).toContain('style="opacity:0.45"');
    expect(markup).toContain("transition-opacity duration-200 ease-in-out");
  });
});
