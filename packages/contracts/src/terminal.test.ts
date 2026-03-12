import { describe, expect, test } from "bun:test";

import type { TerminalRecord } from "./db";
import type { TerminalFailureReason, TerminalStatus, TerminalType } from "./terminal";

describe("terminal contracts", () => {
  test("keeps canonical terminal status values", () => {
    const statuses: TerminalStatus[] = ["active", "detached", "sleeping", "finished", "failed"];

    expect(statuses).toEqual(["active", "detached", "sleeping", "finished", "failed"]);
  });

  test("keeps canonical terminal failure reasons", () => {
    const failureReason: TerminalFailureReason = "attach_failed";
    expect(failureReason).toBe("attach_failed");
  });

  test("keeps canonical terminal type values", () => {
    const types: TerminalType[] = ["shell", "harness", "preset", "command"];
    expect(types).toEqual(["shell", "harness", "preset", "command"]);
  });

  test("supports harness provider metadata on a terminal record", () => {
    const terminal: TerminalRecord = {
      id: "term_1",
      workspace_id: "ws_1",
      launch_type: "harness",
      harness_provider: "codex",
      harness_session_id: "session_1",
      created_by: null,
      label: "Codex · auth-fix",
      failure_reason: null,
      exit_code: null,
      last_active_at: "2026-03-05T08:00:00.000Z",
      started_at: "2026-03-05T08:00:00.000Z",
      status: "active",
      ended_at: null,
    };

    expect(terminal.harness_session_id).toBe("session_1");
    expect(terminal.harness_provider).toBe("codex");
  });
});
