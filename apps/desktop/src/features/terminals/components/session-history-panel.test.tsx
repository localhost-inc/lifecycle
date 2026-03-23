import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mockStoreContext } from "@/test/store-mock";

describe("SessionHistoryPanel", () => {
  beforeEach(() => mockStoreContext());
  afterEach(() => mock.restore());

  test("shows running and ready session state from the shared turn-state provider", async () => {
    const terminalHooksModule = await import("../hooks");
    const responseReadyModule = await import("../state/terminal-response-ready-provider");

    spyOn(terminalHooksModule, "useWorkspaceTerminals").mockReturnValue([
      {
        created_by: null,
        ended_at: null,
        exit_code: null,
        failure_reason: null,
        id: "term-running",
        label: "Terminal · Running",
        last_active_at: "2026-03-08T10:02:00.000Z",
        launch_type: "shell",
        started_at: "2026-03-08T10:00:00.000Z",
        status: "active",
        workspace_id: "ws_1",
      },
      {
        created_by: null,
        ended_at: null,
        exit_code: null,
        failure_reason: null,
        id: "term-ready",
        label: "Terminal · Ready",
        last_active_at: "2026-03-08T10:03:00.000Z",
        launch_type: "shell",
        started_at: "2026-03-08T10:01:00.000Z",
        status: "detached",
        workspace_id: "ws_1",
      },
    ] as never);
    spyOn(responseReadyModule, "useTerminalResponseReady").mockReturnValue({
      clearTerminalResponseReady: () => {},
      clearTerminalTurnRunning: () => {},
      clearWorkspaceResponseReady: () => {},
      hasWorkspaceResponseReady: () => false,
      hasWorkspaceRunningTurn: () => false,
      isTerminalResponseReady: (terminalId: string) => terminalId === "term-ready",
      isTerminalTurnRunning: (terminalId: string) => terminalId === "term-running",
    } as never);

    const { SessionHistoryPanel } = await import("./session-history-panel");
    const markup = renderToStaticMarkup(
      createElement(SessionHistoryPanel, {
        onFocusTerminal: () => {},
        workspaceId: "ws_1",
      }),
    );

    expect(markup).toContain('title="Generating response"');
    expect(markup).toContain('aria-label="Response ready"');
  });
});
