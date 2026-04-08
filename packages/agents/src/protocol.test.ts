import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "./events";
import {
  AgentProtocolStore,
  DEFAULT_AGENT_PROTOCOL_STATE,
  reduceAgentProtocolEvent,
} from "./protocol";

const W = "workspace_1";
const S = "session_1";

function apply(events: AgentEvent[]) {
  return events.reduce(reduceAgentProtocolEvent, DEFAULT_AGENT_PROTOCOL_STATE);
}

describe("agent protocol state", () => {
  test("accumulates assistant text and thinking blocks by part id", () => {
    const state = apply([
      {
        kind: "agent.turn.started",
        workspaceId: W,
        agentId: S,
        turnId: "turn_1",
      },
      {
        kind: "agent.message.part.delta",
        workspaceId: W,
        agentId: S,
        messageId: "turn_1:assistant",
        partId: "turn_1:assistant:text:1",
        part: { type: "text", text: "Hello" },
      },
      {
        kind: "agent.message.part.delta",
        workspaceId: W,
        agentId: S,
        messageId: "turn_1:assistant",
        partId: "turn_1:assistant:text:1",
        part: { type: "text", text: " world" },
      },
      {
        kind: "agent.message.part.completed",
        workspaceId: W,
        agentId: S,
        messageId: "turn_1:assistant",
        partId: "turn_1:assistant:thinking:1",
        part: { type: "thinking", text: "Inspecting auth flow" },
      },
    ]);

    expect(state.turnsById.turn_1?.textByPartId["turn_1:assistant:text:1"]).toBe("Hello world");
    expect(state.turnsById.turn_1?.thinkingByPartId["turn_1:assistant:thinking:1"]).toBe(
      "Inspecting auth flow",
    );
  });

  test("tracks normalized items, deltas, provider requests, and signals", () => {
    const store = new AgentProtocolStore();

    store.apply({
      kind: "agent.item.started",
      workspaceId: W,
      agentId: S,
      turnId: "turn_2",
      item: {
        id: "item_cmd_1",
        command: "bun test",
        output: "",
        status: "running",
        type: "command_execution",
      },
    });
    store.apply({
      kind: "agent.item.delta",
      workspaceId: W,
      agentId: S,
      turnId: "turn_2",
      delta: {
        itemId: "item_cmd_1",
        kind: "command_output",
        text: "1 passed\n",
      },
    });
    store.apply({
      kind: "agent.provider.requested",
      workspaceId: W,
      agentId: S,
      turnId: "turn_2",
      request: {
        id: "request_1",
        kind: "dynamic_tool_call",
        title: "Invoke the host tool",
      },
    });
    store.apply({
      kind: "agent.provider.request.resolved",
      workspaceId: W,
      agentId: S,
      turnId: "turn_2",
      resolution: {
        requestId: "request_1",
        outcome: "completed",
      },
    });
    store.apply({
      kind: "agent.provider.signal",
      workspaceId: W,
      agentId: S,
      turnId: "turn_2",
      signal: {
        channel: "turn",
        name: "model_rerouted",
      },
    });

    const state = store.snapshot();
    expect(state.turnsById.turn_2?.itemsById.item_cmd_1?.type).toBe("command_execution");
    expect(state.turnsById.turn_2?.itemDeltasById.item_cmd_1).toEqual([
      {
        itemId: "item_cmd_1",
        kind: "command_output",
        text: "1 passed\n",
      },
    ]);
    expect(state.requestsById.request_1).toEqual({
      request: {
        id: "request_1",
        kind: "dynamic_tool_call",
        title: "Invoke the host tool",
      },
      resolution: {
        requestId: "request_1",
        outcome: "completed",
      },
    });
    expect(state.turnsById.turn_2?.signals).toEqual([
      {
        channel: "turn",
        name: "model_rerouted",
      },
    ]);
  });
});
