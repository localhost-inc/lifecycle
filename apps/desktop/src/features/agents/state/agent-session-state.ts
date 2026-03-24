import { useSyncExternalStore } from "react";
import {
  clearAgentSessionResponseReady as clearSharedAgentSessionResponseReady,
  clearAgentWorkspaceResponseReady as clearSharedAgentWorkspaceResponseReady,
  createAgentFleetState,
  reduceAgentFleetEvent,
  selectAgentFleetSessionState,
  selectAgentSessionResponseReady,
  selectAgentSessionRunning,
  selectAgentWorkspaceStatus,
  type AgentEvent,
  type AgentFleetSessionState,
} from "@lifecycle/agents";

export type AgentSessionState = AgentFleetSessionState;

let agentFleetState = createAgentFleetState();

const agentSessionListeners = new Map<string, Set<() => void>>();
const agentStoreListeners = new Set<() => void>();

function subscribeAgentStore(listener: () => void): () => void {
  agentStoreListeners.add(listener);
  return () => {
    agentStoreListeners.delete(listener);
  };
}

function emitAgentStoreChange(sessionIds: readonly string[]): void {
  for (const sessionId of sessionIds) {
    for (const listener of agentSessionListeners.get(sessionId) ?? []) {
      listener();
    }
  }

  for (const listener of agentStoreListeners) {
    listener();
  }
}

function writeAgentFleetState(
  affectedSessionIds: readonly string[],
  updater: (state: typeof agentFleetState) => typeof agentFleetState,
): void {
  const nextState = updater(agentFleetState);
  if (nextState === agentFleetState) {
    return;
  }

  agentFleetState = nextState;
  emitAgentStoreChange(affectedSessionIds);
}

export function recordAgentEvent(event: AgentEvent): void {
  const affectedSessionIds =
    event.kind === "agent.session.created" || event.kind === "agent.session.updated"
      ? [event.session.id]
      : "sessionId" in event
        ? [event.sessionId]
        : [];

  if (affectedSessionIds.length === 0) {
    return;
  }

  writeAgentFleetState(affectedSessionIds, (state) => reduceAgentFleetEvent(state, event));
}

export function clearAgentSessionResponseReady(sessionId: string): void {
  writeAgentFleetState([sessionId], (state) => clearSharedAgentSessionResponseReady(state, sessionId));
}

export function clearWorkspaceAgentResponseReady(workspaceId: string): void {
  const affectedSessionIds = Object.entries(agentFleetState.sessionsById)
    .filter(([, sessionState]) => sessionState.workspaceId === workspaceId && sessionState.responseReady)
    .map(([sessionId]) => sessionId);

  if (affectedSessionIds.length === 0) {
    return;
  }

  writeAgentFleetState(affectedSessionIds, (state) =>
    clearSharedAgentWorkspaceResponseReady(state, workspaceId),
  );
}

export function useAgentStatusIndex(): {
  clearAgentSessionResponseReady: (sessionId: string) => void;
  clearWorkspaceAgentResponseReady: (workspaceId: string) => void;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  isAgentSessionResponseReady: (sessionId: string) => boolean;
  isAgentSessionRunning: (sessionId: string) => boolean;
} {
  useSyncExternalStore(subscribeAgentStore, () => agentFleetState, () => agentFleetState);

  return {
    clearAgentSessionResponseReady,
    clearWorkspaceAgentResponseReady,
    hasWorkspaceResponseReady: (workspaceId: string) =>
      selectAgentWorkspaceStatus(agentFleetState, workspaceId).responseReady,
    hasWorkspaceRunningTurn: (workspaceId: string) =>
      selectAgentWorkspaceStatus(agentFleetState, workspaceId).running,
    isAgentSessionResponseReady: (sessionId: string) =>
      selectAgentSessionResponseReady(agentFleetState, sessionId),
    isAgentSessionRunning: (sessionId: string) =>
      selectAgentSessionRunning(agentFleetState, sessionId),
  };
}

export function useAgentSessionState(sessionId: string): AgentSessionState {
  return useSyncExternalStore(
    (listener) => {
      const listeners = agentSessionListeners.get(sessionId) ?? new Set<() => void>();
      listeners.add(listener);
      agentSessionListeners.set(sessionId, listeners);

      return () => {
        const nextListeners = agentSessionListeners.get(sessionId);
        if (!nextListeners) {
          return;
        }

        nextListeners.delete(listener);
        if (nextListeners.size === 0) {
          agentSessionListeners.delete(sessionId);
        }
      };
    },
    () => selectAgentFleetSessionState(agentFleetState, sessionId),
    () => selectAgentFleetSessionState(agentFleetState, sessionId),
  );
}

export function resetAgentSessionStateForTests(): void {
  agentFleetState = createAgentFleetState();
  agentSessionListeners.clear();
  agentStoreListeners.clear();
}
