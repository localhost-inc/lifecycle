import { describe, expect, test } from "bun:test";

import type {
  AgentRecord,
  AgentProviderId,
  AgentStatus,
  AgentEventRecord,
  AgentMessageRecord,
  AgentMessagePartRecord,
  AgentMessageRole,
} from "./agent";
import { parseAgentMessagePartData, stringifyAgentMessagePartData } from "./agent";

describe("agent contracts", () => {
  test("keep canonical agent provider values", () => {
    const providers: AgentProviderId[] = ["claude", "codex"];

    expect(providers).toEqual(["claude", "codex"]);
  });

  test("keep canonical agent status values", () => {
    const statuses: AgentStatus[] = [
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

  test("supports adapter-backed agents as first-party records", () => {
    const agent: AgentRecord = {
      id: "agent_1",
      workspace_id: "workspace_1",
      provider: "claude",
      provider_id: "claude-thread-1",
      title: "Claude Agent",
      status: "idle",
      last_message_at: null,
      created_at: "2026-03-21T00:00:00.000Z",
      updated_at: "2026-03-21T00:00:00.000Z",
    };

    expect(agent.provider).toBe("claude");
    expect(agent.provider_id).toBe("claude-thread-1");
  });

  test("supports normalized agent message records", () => {
    const message: AgentMessageRecord = {
      id: "message_1",
      agent_id: "agent_1",
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
      agent_id: "agent_1",
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
      agent_id: "agent_1",
      workspace_id: "workspace_1",
      provider: "codex",
      provider_id: "thread_1",
      turn_id: "turn_1",
      event_index: 1,
      event_kind: "agent.message.part.completed",
      payload: '{"kind":"agent.message.part.completed"}',
      created_at: "2026-03-22T00:00:00.000Z",
    };

    expect(event.provider_id).toBe("thread_1");
    expect(event.event_kind).toBe("agent.message.part.completed");
  });
});
