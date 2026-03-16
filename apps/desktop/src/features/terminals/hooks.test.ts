import { describe, expect, test } from "bun:test";
import type { TerminalRecord } from "@lifecycle/contracts";
import { reduceTerminal, reduceWorkspaceTerminals } from "./hooks";

const terminal: TerminalRecord = {
  created_by: null,
  ended_at: null,
  exit_code: null,
  failure_reason: null,
  harness_provider: "codex",
  harness_session_id: null,
  id: "terminal-1",
  label: "Codex · Session 1",
  last_active_at: "2026-03-15T16:00:00.000Z",
  launch_type: "harness",
  started_at: "2026-03-15T16:00:00.000Z",
  status: "detached",
  workspace_id: "workspace-1",
};

describe("reduceWorkspaceTerminals", () => {
  test("replaces matching terminals on terminal.updated", () => {
    const result = reduceWorkspaceTerminals(
      [terminal],
      {
        id: "event-1",
        kind: "terminal.updated",
        occurred_at: "2026-03-15T16:01:00.000Z",
        terminal: {
          ...terminal,
          harness_session_id: "session-12345678",
          label: "Codex · Session 2",
        },
        workspace_id: "workspace-1",
      },
      "workspace-1",
    );

    expect(result).toEqual({
      kind: "replace",
      data: [
        {
          ...terminal,
          harness_session_id: "session-12345678",
          label: "Codex · Session 2",
        },
      ],
    });
  });
});

describe("reduceTerminal", () => {
  test("replaces the terminal detail on terminal.updated", () => {
    const result = reduceTerminal(
      terminal,
      {
        id: "event-1",
        kind: "terminal.updated",
        occurred_at: "2026-03-15T16:01:00.000Z",
        terminal: {
          ...terminal,
          harness_session_id: "session-12345678",
          status: "active",
        },
        workspace_id: "workspace-1",
      },
      "terminal-1",
    );

    expect(result).toEqual({
      kind: "replace",
      data: {
        ...terminal,
        harness_session_id: "session-12345678",
        status: "active",
      },
    });
  });
});
