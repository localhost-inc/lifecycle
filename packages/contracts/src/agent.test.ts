import { describe, expect, test } from "bun:test";

import type {
  AgentBackend,
  AgentMessageRecord,
  AgentMessageRole,
  AgentRuntimeKind,
  AgentSessionRecord,
  AgentSessionStatus,
} from "./agent";

describe("agent contracts", () => {
  test("keep canonical agent backend values", () => {
    const backends: AgentBackend[] = ["claude", "codex"];

    expect(backends).toEqual(["claude", "codex"]);
  });

  test("keep canonical agent runtime kind values", () => {
    const runtimeKinds: AgentRuntimeKind[] = ["native", "adapter"];

    expect(runtimeKinds).toEqual(["native", "adapter"]);
  });

  test("keep canonical agent session status values", () => {
    const statuses: AgentSessionStatus[] = [
      "idle",
      "running",
      "waiting_input",
      "waiting_approval",
      "completed",
      "failed",
      "cancelled",
    ];

    expect(statuses).toEqual([
      "idle",
      "running",
      "waiting_input",
      "waiting_approval",
      "completed",
      "failed",
      "cancelled",
    ]);
  });

  test("keep canonical agent message role values", () => {
    const roles: AgentMessageRole[] = ["user", "assistant"];

    expect(roles).toEqual(["user", "assistant"]);
  });

  test("supports adapter-backed agent sessions as first-party records", () => {
    const session: AgentSessionRecord = {
      id: "agent_session_1",
      workspace_id: "workspace_1",
      runtime_kind: "adapter",
      runtime_name: "claude",
      backend: "claude",
      runtime_session_id: "claude-session-1",
      title: "Claude Session",
      status: "idle",
      created_by: null,
      forked_from_session_id: null,
      last_message_at: null,
      created_at: "2026-03-21T00:00:00.000Z",
      updated_at: "2026-03-21T00:00:00.000Z",
      ended_at: null,
    };

    expect(session.runtime_kind).toBe("adapter");
    expect(session.backend).toBe("claude");
    expect(session.runtime_session_id).toBe("claude-session-1");
  });

  test("supports normalized agent message records", () => {
    const message: AgentMessageRecord = {
      id: "message_1",
      session_id: "agent_session_1",
      role: "assistant",
      text: "Hello from Claude.",
      turn_id: "turn_1",
    };

    expect(message.role).toBe("assistant");
    expect(message.turn_id).toBe("turn_1");
  });
});
