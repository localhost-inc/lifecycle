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
  test("formats project:workspace in the body", () => {
    expect(
      createTurnCompletionNotificationCopy(createCompletedTurnEvent(), {
        projectName: "lifecycle",
        sessionTitle: "Fix auth callback",
        workspaceName: "auth-callback",
      }),
    ).toEqual({
      body: "Codex finished in lifecycle:auth-callback.",
      title: "Fix auth callback",
    });
  });

  test("uses workspace name alone when project name is unavailable", () => {
    expect(
      createTurnCompletionNotificationCopy(createCompletedTurnEvent(), {
        sessionTitle: "Fix auth callback",
        workspaceName: "auth-callback",
      }),
    ).toEqual({
      body: "Codex finished in auth-callback.",
      title: "Fix auth callback",
    });
  });

  test("uses project name alone when workspace name is unavailable", () => {
    expect(
      createTurnCompletionNotificationCopy(createCompletedTurnEvent(), {
        projectName: "lifecycle",
      }),
    ).toEqual({
      body: "Codex finished in lifecycle.",
      title: "Response ready",
    });
  });

  test("falls back to generic body without any location context", () => {
    expect(createTurnCompletionNotificationCopy(createCompletedTurnEvent())).toEqual({
      body: "Codex has a response ready.",
      title: "Response ready",
    });
  });

  test("uses provider label for claude", () => {
    expect(
      createTurnCompletionNotificationCopy(
        createCompletedTurnEvent({ harness_provider: "claude" }),
        { projectName: "lifecycle", sessionTitle: "Notification improvements", workspaceName: "main" },
      ),
    ).toEqual({
      body: "Claude finished in lifecycle:main.",
      title: "Notification improvements",
    });
  });

  test("falls back to Agent when the provider is unavailable", () => {
    expect(
      createTurnCompletionNotificationCopy(
        createCompletedTurnEvent({ harness_provider: null }),
      ),
    ).toEqual({
      body: "Agent has a response ready.",
      title: "Response ready",
    });
  });
});
