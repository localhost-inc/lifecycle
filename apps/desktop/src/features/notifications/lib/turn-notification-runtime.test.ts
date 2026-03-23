import { describe, expect, test } from "bun:test";
import {
  createTurnCompletionNotificationCopy,
  type TurnCompletionLifecycleEvent,
} from "@/features/notifications/lib/turn-notification-runtime";

function createCompletedTurnEvent(
  overrides: Partial<TurnCompletionLifecycleEvent> = {},
): TurnCompletionLifecycleEvent {
  return {
    session_id: "session-12345678",
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
        providerName: "Codex",
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
        providerName: "Codex",
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
        providerName: "Codex",
      }),
    ).toEqual({
      body: "Codex finished in lifecycle.",
      title: "Response ready",
    });
  });

  test("falls back to generic body without any location context", () => {
    expect(
      createTurnCompletionNotificationCopy(createCompletedTurnEvent(), { providerName: "Codex" }),
    ).toEqual({
      body: "Codex has a response ready.",
      title: "Response ready",
    });
  });

  test("uses provider label for claude", () => {
    expect(
      createTurnCompletionNotificationCopy(createCompletedTurnEvent(), {
        projectName: "lifecycle",
        providerName: "Claude",
        sessionTitle: "Notification improvements",
        workspaceName: "main",
      }),
    ).toEqual({
      body: "Claude finished in lifecycle:main.",
      title: "Notification improvements",
    });
  });

  test("falls back to Agent when the provider is unavailable", () => {
    expect(createTurnCompletionNotificationCopy(createCompletedTurnEvent())).toEqual({
      body: "Agent has a response ready.",
      title: "Response ready",
    });
  });
});
