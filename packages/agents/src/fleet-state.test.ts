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
