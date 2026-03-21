import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("SessionHistoryPanel", () => {
  afterEach(() => {
    mock.restore();
  });

  test("shows running and ready session state from the shared turn-state provider", async () => {
    const terminalHooksModule = await import("../hooks");
    const responseReadyModule = await import("../state/terminal-response-ready-provider");

    spyOn(terminalHooksModule, "useWorkspaceTerminals").mockReturnValue({
      data: [
        {
          created_by: null,
          ended_at: null,
          exit_code: null,
          failure_reason: null,
          harness_provider: "codex",
          harness_session_id: "running-session",
          id: "term-running",
          label: "Codex · Running",
          last_active_at: "2026-03-08T10:02:00.000Z",
          launch_type: "harness",
          started_at: "2026-03-08T10:00:00.000Z",
          status: "active",
          workspace_id: "ws_1",
        },
        {
          created_by: null,
          ended_at: null,
          exit_code: null,
          failure_reason: null,
          harness_provider: "claude",
          harness_session_id: "ready-session",
          id: "term-ready",
          label: "Claude · Ready",
          last_active_at: "2026-03-08T10:03:00.000Z",
          launch_type: "harness",
          started_at: "2026-03-08T10:01:00.000Z",
          status: "detached",
          workspace_id: "ws_1",
        },
      ],
    } as never);
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
