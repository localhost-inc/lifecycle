import { describe, expect, test } from "bun:test";
import type { AgentWorkerRegistration, AgentWorkerSnapshot } from "./protocol";

describe("agent worker protocol", () => {
  test("defines a durable registration payload for reconnecting desktop sessions", () => {
    const registration: AgentWorkerRegistration = {
      provider: "codex",
      providerSessionId: "thread_1",
      sessionId: "agent_session_1",
      pid: 4242,
      port: 43127,
      token: "secret-token",
      status: "running",
      activeTurnId: "turn_1",
      pendingApproval: null,
      updatedAt: "2026-03-23T00:00:00.000Z",
    };

    expect(registration.port).toBe(43127);
    expect(registration.status).toBe("running");
  });

  test("defines a websocket snapshot payload for reconnect reconciliation", () => {
    const snapshot: AgentWorkerSnapshot = {
      kind: "worker.state",
      provider: "claude",
      providerSessionId: "session_1",
      sessionId: "agent_session_2",
      status: "waiting_input",
      activeTurnId: "turn_2",
      pendingApproval: {
        id: "approval_1",
        kind: "question",
      },
      updatedAt: "2026-03-23T00:00:00.000Z",
    };

    expect(snapshot.pendingApproval?.kind).toBe("question");
    expect(snapshot.kind).toBe("worker.state");
  });
});
