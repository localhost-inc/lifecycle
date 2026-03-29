import { beforeEach, describe, expect, test } from "bun:test";
import {
  getAgentSessionStoreSnapshot,
  getAgentStatusIndex,
  recordAgentSessionEvent,
  resetAgentSessionStoreForTests,
} from "./store";

describe("agent session store bindings", () => {
  beforeEach(() => {
    resetAgentSessionStoreForTests();
  });

  test("returns a stable status index object between reads", () => {
    expect(getAgentStatusIndex()).toBe(getAgentStatusIndex());
  });

  test("updates the external-store snapshot when session state changes", () => {
    const before = getAgentSessionStoreSnapshot();

    recordAgentSessionEvent({
      kind: "agent.turn.started",
      sessionId: "session-1",
      turnId: "turn-1",
      workspaceId: "workspace-1",
    });

    const after = getAgentSessionStoreSnapshot();

    expect(after).not.toBe(before);
    expect(getAgentStatusIndex().isAgentSessionRunning("session-1")).toBeTrue();
  });
});
