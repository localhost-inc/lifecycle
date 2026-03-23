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
    const types: TerminalType[] = ["shell", "preset", "command"];
    expect(types).toEqual(["shell", "preset", "command"]);
  });

  test("keeps terminal records focused on shell session state", () => {
    const terminal: TerminalRecord = {
      id: "term_1",
      workspace_id: "ws_1",
      launch_type: "shell",
      created_by: null,
      label: "Terminal 1",
      failure_reason: null,
      exit_code: null,
      last_active_at: "2026-03-05T08:00:00.000Z",
      started_at: "2026-03-05T08:00:00.000Z",
      status: "active",
      ended_at: null,
    };

    expect(terminal.launch_type).toBe("shell");
    expect(terminal.label).toBe("Terminal 1");
  });
});
