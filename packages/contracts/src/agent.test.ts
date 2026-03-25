import { describe, expect, test } from "bun:test";

import type {
  AgentEventRecord,
  AgentSessionProviderId,
  AgentMessageRecord,
  AgentMessagePartRecord,
  AgentMessageRole,
  AgentSessionRecord,
  AgentSessionStatus,
} from "./agent";
import { parseAgentMessagePartData, stringifyAgentMessagePartData } from "./agent";

describe("agent contracts", () => {
  test("keep canonical agent provider values", () => {
    const providers: AgentSessionProviderId[] = ["claude", "codex"];

    expect(providers).toEqual(["claude", "codex"]);
  });

  test("keep canonical agent session status values", () => {
    const statuses: AgentSessionStatus[] = [
      "starting",
      "idle",
      "running",
      "waiting_input",
      "waiting_approval",
      "completed",
      "failed",
      "cancelled",
    ];

    expect(statuses).toEqual([
      "starting",
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
    const roles: AgentMessageRole[] = ["user", "assistant", "system", "tool"];

    expect(roles).toEqual(["user", "assistant", "system", "tool"]);
  });

  test("supports adapter-backed agent sessions as first-party records", () => {
    const session: AgentSessionRecord = {
      id: "agent_session_1",
      workspace_id: "workspace_1",
      provider: "claude",
      provider_session_id: "claude-session-1",
      title: "Claude Session",
      status: "idle",
      last_message_at: null,
      created_at: "2026-03-21T00:00:00.000Z",
      updated_at: "2026-03-21T00:00:00.000Z",
    };

    expect(session.provider).toBe("claude");
    expect(session.provider_session_id).toBe("claude-session-1");
  });

  test("supports normalized agent message records", () => {
    const message: AgentMessageRecord = {
      id: "message_1",
      session_id: "agent_session_1",
      role: "assistant",
      text: "Hello from Claude.",
      turn_id: "turn_1",
      created_at: "2026-03-22T00:00:00.000Z",
    };

    expect(message.role).toBe("assistant");
    expect(message.turn_id).toBe("turn_1");
  });

  test("stores typed message-part data behind data", () => {
    const part: AgentMessagePartRecord = {
      id: "part_1",
      message_id: "message_1",
      session_id: "agent_session_1",
      part_index: 0,
      part_type: "tool_call",
      text: null,
      data: stringifyAgentMessagePartData({
        tool_call_id: "tool_1",
        tool_name: "Read",
        input_json: '{"file_path":"/tmp/file.ts"}',
      }),
      created_at: "2026-03-22T00:00:00.000Z",
    };

    expect(parseAgentMessagePartData(part.part_type, part.data)).toEqual({
      tool_call_id: "tool_1",
      tool_name: "Read",
      input_json: '{"file_path":"/tmp/file.ts"}',
    });
  });

  test("supports append-only agent event records", () => {
    const event: AgentEventRecord = {
      id: "event_1",
      session_id: "agent_session_1",
      workspace_id: "workspace_1",
      provider: "codex",
      provider_session_id: "thread_1",
      turn_id: "turn_1",
      event_index: 1,
      event_kind: "agent.message.part.completed",
      payload: '{"kind":"agent.message.part.completed"}',
      created_at: "2026-03-22T00:00:00.000Z",
    };

    expect(event.provider_session_id).toBe("thread_1");
    expect(event.event_kind).toBe("agent.message.part.completed");
  });
});
