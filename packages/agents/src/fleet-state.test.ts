import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "./events";
import {
  clearAgentSessionResponseReady,
  clearAgentWorkspaceResponseReady,
  createAgentFleetState,
  reduceAgentFleetEvent,
  selectAgentFleetSessionState,
  selectAgentSessionResponseReady,
  selectAgentSessionRunning,
  selectAgentWorkspaceStatus,
} from "./fleet-state";

function applyEvents(events: AgentEvent[]) {
  return events.reduce(reduceAgentFleetEvent, createAgentFleetState());
}

describe("agent fleet state", () => {
  test("tracks session running and ready state across turn lifecycle events", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
    ]);

    expect(selectAgentSessionRunning(state, "session-1")).toBeFalse();
    expect(selectAgentSessionResponseReady(state, "session-1")).toBeTrue();
    expect(selectAgentWorkspaceStatus(state, "workspace-1")).toEqual({
      responseReady: true,
      running: false,
    });
  });

  test("tracks turn activity phase through thinking, tool_use, and responding", () => {
    // Turn starts → thinking phase
    let state = applyEvents([
      {
        kind: "agent.turn.started",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
    ]);
    expect(selectAgentFleetSessionState(state, "session-1").turnActivity).toEqual({
      phase: "thinking",
      toolName: null,
      toolCallCount: 0,
    });

    // Thinking delta keeps thinking phase
    state = reduceAgentFleetEvent(state, {
      kind: "agent.message.part.delta",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:thinking:0",
      part: { type: "thinking", text: "Let me analyze..." },
    });
    expect(selectAgentFleetSessionState(state, "session-1").turnActivity).toEqual({
      phase: "thinking",
      toolName: null,
      toolCallCount: 0,
    });

    // Tool call → tool_use phase
    state = reduceAgentFleetEvent(state, {
      kind: "agent.message.part.completed",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:tool:1",
      part: { type: "tool_call", toolCallId: "tc-1", toolName: "Read", inputJson: "{}" },
    });
    expect(selectAgentFleetSessionState(state, "session-1").turnActivity).toEqual({
      phase: "tool_use",
      toolName: "Read",
      toolCallCount: 1,
    });

    // Second tool call increments count
    state = reduceAgentFleetEvent(state, {
      kind: "agent.message.part.completed",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:tool:2",
      part: { type: "tool_call", toolCallId: "tc-2", toolName: "Grep", inputJson: "{}" },
    });
    expect(selectAgentFleetSessionState(state, "session-1").turnActivity).toEqual({
      phase: "tool_use",
      toolName: "Grep",
      toolCallCount: 2,
    });

    // Text delta → responding phase
    state = reduceAgentFleetEvent(state, {
      kind: "agent.message.part.delta",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      messageId: "turn-1:assistant",
      partId: "turn-1:assistant:text:0",
      part: { type: "text", text: "Here is what I found..." },
    });
    expect(selectAgentFleetSessionState(state, "session-1").turnActivity).toEqual({
      phase: "responding",
      toolName: null,
      toolCallCount: 2,
    });

    // Turn completes → activity cleared
    state = reduceAgentFleetEvent(state, {
      kind: "agent.turn.completed",
      sessionId: "session-1",
      turnId: "turn-1",
      workspaceId: "workspace-1",
    });
    expect(selectAgentFleetSessionState(state, "session-1").turnActivity).toBeNull();
  });

  test("clears turn activity on turn failure", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.failed",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
        error: "interrupted",
      },
    ]);
    expect(selectAgentFleetSessionState(state, "session-1").turnActivity).toBeNull();
  });

  test("tracks approval and error state on the normalized session model", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        approval: {
          id: "approval-1",
          kind: "shell",
          message: "Run command?",
          scopeKey: "command:1",
          sessionId: "session-1",
          status: "pending",
        },
        kind: "agent.approval.requested",
        sessionId: "session-1",
        workspaceId: "workspace-1",
      },
      {
        error: "failed",
        kind: "agent.turn.failed",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
    ]);

    expect(selectAgentFleetSessionState(state, "session-1")).toMatchObject({
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
        sessionId: "session-1",
        status: "startup failed",
        workspaceId: "workspace-1",
      },
    ]);

    expect(selectAgentFleetSessionState(state, "session-1")).toMatchObject({
      providerStatus: "Codex login failed.",
      workspaceId: "workspace-1",
    });
  });

  test("accumulates token usage and cost across turns", () => {
    const state = applyEvents([
      {
        kind: "agent.turn.started",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
        usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500 },
        costUsd: 0.05,
      },
      {
        kind: "agent.turn.started",
        sessionId: "session-1",
        turnId: "turn-2",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        sessionId: "session-1",
        turnId: "turn-2",
        workspaceId: "workspace-1",
        usage: { inputTokens: 2000, outputTokens: 400 },
        costUsd: 0.08,
      },
    ]);

    const sessionState = selectAgentFleetSessionState(state, "session-1");
    expect(sessionState.usage).toEqual({
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
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
        usage: { inputTokens: 1000, outputTokens: 200 },
        costUsd: 0.05,
      },
      {
        kind: "agent.turn.completed",
        sessionId: "session-1",
        turnId: "turn-2",
        workspaceId: "workspace-1",
      },
    ]);

    const sessionState = selectAgentFleetSessionState(state, "session-1");
    expect(sessionState.usage).toEqual({
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
        sessionId: "session-1",
        turnId: "turn-1",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.started",
        sessionId: "session-2",
        turnId: "turn-2",
        workspaceId: "workspace-1",
      },
      {
        kind: "agent.turn.completed",
        sessionId: "session-3",
        turnId: "turn-3",
        workspaceId: "workspace-2",
      },
    ]);

    expect(selectAgentWorkspaceStatus(baseState, "workspace-1")).toEqual({
      responseReady: true,
      running: true,
    });

    const clearedSessionState = clearAgentSessionResponseReady(baseState, "session-1");
    expect(selectAgentSessionResponseReady(clearedSessionState, "session-1")).toBeFalse();
    expect(selectAgentWorkspaceStatus(clearedSessionState, "workspace-1")).toEqual({
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
