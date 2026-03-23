import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminalSessionHistory } from "@/features/terminals/components/terminal-session-history";

describe("TerminalSessionHistory", () => {
  test("renders open actions from persisted workspace sessions", () => {
    const markup = renderToStaticMarkup(
      createElement(TerminalSessionHistory, {
        activeTerminalId: "term-active",
        creatingSelection: null,
        isTerminalResponseReady: () => false,
        isTerminalTurnRunning: () => false,
        onOpenTerminal: () => {},
        terminals: [
          {
            created_by: null,
            ended_at: null,
            exit_code: null,
            failure_reason: null,
            id: "term-active",
            label: "Terminal 1",
            last_active_at: "2026-03-08T10:02:00.000Z",
            launch_type: "shell",
            started_at: "2026-03-08T10:00:00.000Z",
            status: "active",
            workspace_id: "ws_1",
          },
          {
            created_by: null,
            ended_at: "2026-03-08T10:07:00.000Z",
            exit_code: 0,
            failure_reason: null,
            id: "term-finished",
            label: "Terminal 2",
            last_active_at: "2026-03-08T10:06:00.000Z",
            launch_type: "shell",
            started_at: "2026-03-08T10:01:00.000Z",
            status: "finished",
            workspace_id: "ws_1",
          },
          {
            created_by: null,
            ended_at: "2026-03-08T10:08:00.000Z",
            exit_code: 1,
            failure_reason: "unknown",
            id: "term-failed",
            label: "Terminal 3",
            last_active_at: "2026-03-08T10:07:00.000Z",
            launch_type: "shell",
            started_at: "2026-03-08T10:03:00.000Z",
            status: "failed",
            workspace_id: "ws_1",
          },
        ],
      }),
    );

    expect(markup).toContain("Terminal 1");
    expect(markup).toContain("Terminal 2");
    expect(markup).toContain("Terminal 3");
    // Active terminal row uses active background
    expect(markup).toContain("bg-[var(--surface-hover)]");
    expect(markup).toContain('disabled=""');
  });

  test("renders running and ready indicators for active session rows", () => {
    const markup = renderToStaticMarkup(
      createElement(TerminalSessionHistory, {
        activeTerminalId: null,
        creatingSelection: null,
        isTerminalResponseReady: (terminalId) => terminalId === "term-ready",
        isTerminalTurnRunning: (terminalId) => terminalId === "term-running",
        onOpenTerminal: () => {},
        terminals: [
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
        ],
      }),
    );

    expect(markup).toContain('title="Generating response"');
    expect(markup).toContain('aria-label="Response ready"');
  });
});
