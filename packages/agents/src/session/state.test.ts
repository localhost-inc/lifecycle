import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "../events";
import {
  clearAgentResponseReady,
  clearAgentWorkspaceResponseReady,
  createAgentStore,
  reduceAgentEvent,
  selectAgentState,
  selectAgentResponseReady,
  selectAgentRunning,
  selectAgentWorkspaceStatus,
} from "./state";

function applyEvents(events: AgentEvent[]) {
  return events.reduce(reduceAgentEvent, createAgentStore());
}

describe("agent store", () => {
  test("tracks session running and ready state across turn lifecycle events", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
    ]);

    expect(selectAgentRunning(state, "session-1")).toBeFalse();
    expect(selectAgentResponseReady(state, "session-1")).toBeTrue();
    expect(selectAgentWorkspaceStatus(state, "workspace-1")).toEqual({
      responseReady: true,
      running: false,
    });
  });

  test("clears stale pending turn ids when a turn completes", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-2",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        agentId: "session-1",
        turnId: "turn-2",
        workspaceId: "workspace-1",
      },
    ]);

    expect(selectAgentState(state, "session-1").pendingTurnIds).toEqual([]);
    expect(selectAgentRunning(state, "session-1")).toBeFalse();
    expect(selectAgentResponseReady(state, "session-1")).toBeTrue();
  });

  test("tracks turn activity phase through thinking, tool_use, and responding", () => {
    // Turn starts → thinking phase
    let state = applyEvents([
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
    ]);
    expect(selectAgentState(state, "session-1").turnActivity).toEqual({
      phase: "thinking",
      toolName: null,
      toolCallCount: 0,
    });

    // Thinking delta keeps thinking phase
    state = reduceAgentEvent(state, {
      kind: "agent.message.part.delta",
      agentId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:thinking:0",
      part: { type: "thinking", text: "Let me analyze..." },
    });
    expect(selectAgentState(state, "session-1").turnActivity).toEqual({
      phase: "thinking",
      toolName: null,
      toolCallCount: 0,
    });

    // Tool call → tool_use phase
    state = reduceAgentEvent(state, {
      kind: "agent.message.part.completed",
      agentId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:tool:1",
      part: { type: "tool_call", toolCallId: "tc-1", toolName: "Read", inputJson: "{}" },
    });
    expect(selectAgentState(state, "session-1").turnActivity).toEqual({
      phase: "tool_use",
      toolCallId: "tc-1",
      toolName: "Read",
      toolCallCount: 1,
    });

    // Second tool call increments count
    state = reduceAgentEvent(state, {
      kind: "agent.message.part.completed",
      agentId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:tool:2",
      part: { type: "tool_call", toolCallId: "tc-2", toolName: "Grep", inputJson: "{}" },
    });
    expect(selectAgentState(state, "session-1").turnActivity).toEqual({
      phase: "tool_use",
      toolCallId: "tc-2",
      toolName: "Grep",
      toolCallCount: 2,
    });

    // Text delta → responding phase
    state = reduceAgentEvent(state, {
      kind: "agent.message.part.delta",
      agentId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:text:0",
      part: { type: "text", text: "Here is what I found..." },
    });
    expect(selectAgentState(state, "session-1").turnActivity).toEqual({
      phase: "responding",
      toolName: null,
      toolCallCount: 2,
    });

    // Turn completes → activity cleared
    state = reduceAgentEvent(state, {
      kind: "agent.turn.completed",
      agentId: "session-1",
      turnId: "turn-1",
      workspaceId: "workspace-1",
    });
    expect(selectAgentState(state, "session-1").turnActivity).toBeNull();
  });

  test("clears turn activity on turn failure", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.failed",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
        error: "interrupted",
      },
    ]);
    expect(selectAgentState(state, "session-1").turnActivity).toBeNull();
  });

  test("counts repeated same-named tool calls by toolCallId", () => {
    let state = applyEvents([
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
    ]);

    state = reduceAgentEvent(state, {
      kind: "agent.message.part.completed",
      agentId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:tool:read-1",
      part: { type: "tool_call", toolCallId: "read-1", toolName: "Read", inputJson: "{}" },
    });
    expect(selectAgentState(state, "session-1").turnActivity).toEqual({
      phase: "tool_use",
      toolCallId: "read-1",
      toolName: "Read",
      toolCallCount: 1,
    });

    state = reduceAgentEvent(state, {
      kind: "agent.message.part.completed",
      agentId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:tool:read-2",
      part: { type: "tool_call", toolCallId: "read-2", toolName: "Read", inputJson: "{}" },
    });
    expect(selectAgentState(state, "session-1").turnActivity).toEqual({
      phase: "tool_use",
      toolCallId: "read-2",
      toolName: "Read",
      toolCallCount: 2,
    });

    state = reduceAgentEvent(state, {
      kind: "agent.message.part.completed",
      agentId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:tool:read-2",
      part: {
        type: "tool_call",
        toolCallId: "read-2",
        toolName: "Read",
        inputJson: "{}",
        status: "completed",
      },
    });
    expect(selectAgentState(state, "session-1").turnActivity).toEqual({
      phase: "tool_use",
      toolCallId: "read-2",
      toolName: "Read",
      toolCallCount: 2,
    });
  });

  test("tracks approval and error state on the normalized session model", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        approval: {
          id: "approval-1",
          kind: "shell",
          message: "Run command?",
          scopeKey: "command:1",
          agentId: "session-1",
          status: "pending",
        },
        kind: "agent.approval.requested",
        agentId: "session-1",
        workspaceId: "workspace-1",
      },
      {
        error: "failed",
        kind: "agent.turn.failed",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
    ]);

    expect(selectAgentState(state, "session-1")).toMatchObject({
      lastError: "failed",
      pendingApprovals: [],
      responseReady: false,
      workspaceId: "workspace-1",
    });
  });

  test("prefers detailed provider status text when present", () => {
    const state = applyEvents([
      {
        detail: "Codex login failed.",
        kind: "agent.status.updated",
        agentId: "session-1",
        status: "startup failed",
        workspaceId: "workspace-1",
      },
    ]);

    expect(selectAgentState(state, "session-1")).toMatchObject({
      providerStatus: "Codex login failed.",
      workspaceId: "workspace-1",
    });
  });

  test("clears provider status when an empty update is emitted", () => {
    const state = applyEvents([
      {
        detail: "Reconnecting to agent...",
        kind: "agent.status.updated",
        agentId: "session-1",
        status: "reconnecting",
        workspaceId: "workspace-1",
      },
      {
        detail: null,
        kind: "agent.status.updated",
        agentId: "session-1",
        status: "",
        workspaceId: "workspace-1",
      },
    ]);

    expect(selectAgentState(state, "session-1")).toMatchObject({
      providerStatus: null,
      workspaceId: "workspace-1",
    });
  });

  test("accumulates token usage and cost across turns", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
        usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500 },
        costUsd: 0.05,
      },
      {
        kind: "agent.turn.started",
        agentId: "session-1",
        turnId: "turn-2",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        agentId: "session-1",
        turnId: "turn-2",
        workspaceId: "workspace-1",
        usage: { inputTokens: 2000, outputTokens: 400 },
        costUsd: 0.08,
      },
    ]);

    const agentState = selectAgentState(state, "session-1");
    expect(agentState.usage).toEqual({
      inputTokens: 3000,
      outputTokens: 600,
      cacheReadTokens: 500,
      costUsd: 0.13,
    });
  });

  test("preserves usage when turn completes without usage data", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.completed",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
        usage: { inputTokens: 1000, outputTokens: 200 },
        costUsd: 0.05,
      },
      {
        kind: "agent.turn.completed",
        agentId: "session-1",
        turnId: "turn-2",
        workspaceId: "workspace-1",
      },
    ]);

    const agentState = selectAgentState(state, "session-1");
    expect(agentState.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      costUsd: 0.05,
    });
  });

  test("aggregates workspace status across multiple sessions and clears ready flags", () => {
    const baseState = applyEvents([
      {
        kind: "agent.turn.completed",
        agentId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.started",
        agentId: "session-2",
        turnId: "turn-2",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        agentId: "session-3",
        turnId: "turn-3",
        workspaceId: "workspace-2",
      },
    ]);

    expect(selectAgentWorkspaceStatus(baseState, "workspace-1")).toEqual({
      responseReady: true,
      running: true,
    });

    const clearedAgentState = clearAgentResponseReady(baseState, "session-1");
    expect(selectAgentResponseReady(clearedAgentState, "session-1")).toBeFalse();
    expect(selectAgentWorkspaceStatus(clearedAgentState, "workspace-1")).toEqual({
      responseReady: false,
      running: true,
    });

    const clearedWorkspaceState = clearAgentWorkspaceResponseReady(baseState, "workspace-1");
    expect(selectAgentWorkspaceStatus(clearedWorkspaceState, "workspace-1")).toEqual({
      responseReady: false,
      running: true,
    });
    expect(selectAgentWorkspaceStatus(clearedWorkspaceState, "workspace-2")).toEqual({
      responseReady: true,
      running: false,
    });
  });
});
