import { describe, expect, test } from "bun:test";

import type {
  TerminalFailureReason,
  TerminalRecord,
  TerminalStatus,
  TerminalType,
} from "./terminal";

describe("terminal contracts", () => {
  test("keeps canonical terminal status values", () => {
    const statuses: TerminalStatus[] = ["active", "detached", "sleeping", "finished", "failed"];

    expect(statuses).toEqual(["active", "detached", "sleeping", "finished", "failed"]);
  });

  test("keeps canonical terminal failure reasons", () => {
    const failureReason: TerminalFailureReason = "local_pty_spawn_failed";
    expect(failureReason).toBe("local_pty_spawn_failed");
  });

  test("keeps canonical terminal type values", () => {
    const types: TerminalType[] = ["shell", "harness", "preset", "command"];
    expect(types).toEqual(["shell", "harness", "preset", "command"]);
  });

  test("supports harness provider metadata on a terminal record", () => {
    const terminal: TerminalRecord = {
      id: "term_1",
      workspaceId: "ws_1",
      launchType: "harness",
      harnessProvider: "codex",
      harnessSessionId: "session_1",
      label: "Codex · auth-fix",
      lastActiveAt: "2026-03-05T08:00:00.000Z",
      startedAt: "2026-03-05T08:00:00.000Z",
      status: "active",
    };

    expect(terminal.harnessSessionId).toBe("session_1");
    expect(terminal.harnessProvider).toBe("codex");
  });
});
