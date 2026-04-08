import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "@lifecycle/agents";

import { BRIDGE_AGENT_SOCKET_TOPIC, bridgeSocketMessageFromAgentEvent } from "./events";

describe("agent bridge socket messages", () => {
  test("maps session lifecycle events onto the bridge websocket shape", () => {
    const event: AgentEvent = {
      kind: "agent.created",
      workspaceId: "workspace-1",
      agent: {
        id: "session-1",
        workspace_id: "workspace-1",
        provider: "codex",
        provider_id: null,
        title: "Codex",
        status: "starting",
        last_message_at: null,
        created_at: "2026-04-04T00:00:00.000Z",
        updated_at: "2026-04-04T00:00:00.000Z",
      },
    };

    expect(BRIDGE_AGENT_SOCKET_TOPIC).toBe("agent");
    expect(
      bridgeSocketMessageFromAgentEvent(event, {
        occurredAt: "2026-04-04T00:00:01.000Z",
      }),
    ).toEqual({
      type: "agent.created",
      occurredAt: "2026-04-04T00:00:01.000Z",
      ...event,
    });
  });

  test("preserves arbitrary provider payloads for raw agent events", () => {
    const event: AgentEvent = {
      kind: "agent.provider.event",
      workspaceId: "workspace-1",
      agentId: "session-1",
      turnId: "turn-1",
      eventType: "codex.notification.turn/started",
      payload: {
        jsonrpc: "2.0",
        method: "turn/started",
        params: { turn: { id: "provider-turn-1" } },
      },
    };

    expect(
      bridgeSocketMessageFromAgentEvent(event, {
        occurredAt: "2026-04-04T00:00:01.000Z",
      }),
    ).toEqual({
      type: "agent.provider.event",
      occurredAt: "2026-04-04T00:00:01.000Z",
      ...event,
    });
  });

  test("attaches projected transcript messages when the bridge has them", () => {
    const event: AgentEvent = {
      kind: "agent.message.part.completed",
      workspaceId: "workspace-1",
      agentId: "session-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:part:1",
      part: { type: "text", text: "hello" },
    };

    expect(
      bridgeSocketMessageFromAgentEvent(event, {
        occurredAt: "2026-04-04T00:00:01.000Z",
        projectedMessage: {
          id: "turn-1:assistant",
          agent_id: "session-1",
          role: "assistant",
          text: "hello",
          turn_id: "turn-1",
          created_at: "2026-04-04T00:00:00.000Z",
          parts: [
            {
              id: "turn-1:assistant:part:1",
              message_id: "turn-1:assistant",
              agent_id: "session-1",
              part_index: 1,
              part_type: "text",
              text: "hello",
              data: null,
              created_at: "2026-04-04T00:00:00.000Z",
            },
          ],
        },
      }),
    ).toEqual({
      type: "agent.message.part.completed",
      occurredAt: "2026-04-04T00:00:01.000Z",
      projectedMessage: {
        id: "turn-1:assistant",
        agent_id: "session-1",
        role: "assistant",
        text: "hello",
        turn_id: "turn-1",
        created_at: "2026-04-04T00:00:00.000Z",
        parts: [
          {
            id: "turn-1:assistant:part:1",
            message_id: "turn-1:assistant",
            agent_id: "session-1",
            part_index: 1,
            part_type: "text",
            text: "hello",
            data: null,
            created_at: "2026-04-04T00:00:00.000Z",
          },
        ],
      },
      ...event,
    });
  });
});
