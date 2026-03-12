import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryProvider } from "../../../query";

describe("WorkspaceSurface layout", () => {
  afterEach(() => {
    mock.restore();
  });

  test("keeps the tab strip flush on the left edge while preserving action padding", async () => {
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

    expect(markup).toContain('class="flex items-center gap-2 pt-1 pb-3"');
    expect(markup).not.toContain("px-3");
  });
});
