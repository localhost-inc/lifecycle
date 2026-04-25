import { describe, expect, test } from "bun:test";

import { TERMINAL_ACTIVITY_STATES, WORKSPACE_ACTIVITY_EVENT_NAMES } from "./activity";

describe("activity contracts", () => {
  test("keep canonical workspace activity event names", () => {
    expect(WORKSPACE_ACTIVITY_EVENT_NAMES).toEqual([
      "turn.started",
      "turn.completed",
      "tool_call.started",
      "tool_call.completed",
      "permission.requested",
      "permission.resolved",
    ]);
  });

  test("keep canonical terminal activity states", () => {
    expect(TERMINAL_ACTIVITY_STATES).toEqual([
      "idle",
      "command_running",
      "turn_active",
      "tool_active",
      "waiting",
      "interactive_quiet",
      "interactive_active",
      "unknown",
    ]);
  });
});
