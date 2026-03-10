import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminalSessionHistory } from "./terminal-session-history";

describe("TerminalSessionHistory", () => {
  test("renders open and resume actions from persisted workspace sessions", () => {
    const markup = renderToStaticMarkup(
      createElement(TerminalSessionHistory, {
        activeTerminalId: "term-active",
        creatingSelection: null,
        onOpenTerminal: () => {},
        onResumeTerminal: () => {},
        terminals: [
          {
            created_by: null,
            ended_at: null,
            exit_code: null,
            failure_reason: null,
            harness_provider: null,
            harness_session_id: null,
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
            harness_provider: "codex",
            harness_session_id: "abcdefgh12345678",
            id: "term-finished",
            label: "Codex · Session 2",
            last_active_at: "2026-03-08T10:06:00.000Z",
            launch_type: "harness",
            started_at: "2026-03-08T10:01:00.000Z",
            status: "finished",
            workspace_id: "ws_1",
          },
          {
            created_by: null,
            ended_at: "2026-03-08T10:08:00.000Z",
            exit_code: 1,
            failure_reason: "unknown",
            harness_provider: "claude",
            harness_session_id: null,
            id: "term-failed",
            label: "Claude · Session 3",
            last_active_at: "2026-03-08T10:07:00.000Z",
            launch_type: "harness",
            started_at: "2026-03-08T10:03:00.000Z",
            status: "failed",
            workspace_id: "ws_1",
          },
        ],
      }),
    );

    expect(markup).toContain("Terminal 1");
    expect(markup).toContain("Codex · Session 2");
    expect(markup).toContain("zsh");
    expect(markup).toContain("session abcdef");
    expect(markup).toContain(">Current<");
    expect((markup.match(/>Resume</g) ?? []).length).toBe(1);
    expect(markup).toContain("space-y-1.5");
    expect(markup).toContain("rounded-2xl");
    expect(markup).toContain("bg-[var(--surface-hover)]");
  });
});
