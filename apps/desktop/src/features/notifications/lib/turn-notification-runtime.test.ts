import { describe, expect, test } from "bun:test";
import type { LifecycleEventOf } from "@lifecycle/contracts";
import { createTurnCompletionNotificationCopy } from "./turn-notification-runtime";

function createCompletedTurnEvent(
  overrides: Partial<LifecycleEventOf<"terminal.harness_turn_completed">> = {},
): LifecycleEventOf<"terminal.harness_turn_completed"> {
  return {
    completion_key: "codex:turn_1",
    harness_provider: "codex",
    harness_session_id: "session-12345678",
    id: "event_1",
    kind: "terminal.harness_turn_completed",
    occurred_at: "2026-03-12T00:00:00.000Z",
    terminal_id: "terminal_1",
    turn_id: "turn_1",
    workspace_id: "workspace_1",
    ...overrides,
  };
}

describe("createTurnCompletionNotificationCopy", () => {
  test("formats provider-specific notification copy", () => {
    expect(createTurnCompletionNotificationCopy(createCompletedTurnEvent())).toEqual({
      body: "Session 12345678 has a response ready in Lifecycle.",
      title: "Codex turn completed",
    });
  });

  test("falls back when the provider or session id is unavailable", () => {
    expect(
      createTurnCompletionNotificationCopy(
        createCompletedTurnEvent({
          harness_provider: null,
          harness_session_id: null,
        }),
      ),
    ).toEqual({
      body: "Lifecycle has a response ready.",
      title: "Harness turn completed",
    });
  });
});
