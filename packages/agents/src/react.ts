import { useSyncExternalStore } from "react";
import type { AgentEvent } from "./events";
import {
  clearAgentSessionResponseReady as clearSharedAgentSessionResponseReady,
  clearAgentWorkspaceResponseReady as clearSharedAgentWorkspaceResponseReady,
  createAgentSessionStore,
  reduceAgentSessionEvent,
  selectAgentSessionResponseReady,
  selectAgentSessionRunning,
  selectAgentSessionState,
  selectAgentWorkspaceStatus,
  type AgentSessionState,
} from "./agent-session-store";

// Preserve agent session store state across Vite HMR so active sessions survive hot reloads.
let agentSessionStoreState: ReturnType<typeof createAgentSessionStore> =
  import.meta.hot?.data.agentSessionStoreState ?? createAgentSessionStore();

const agentSessionListeners: Map<string, Set<() => void>> = import.meta.hot?.data
  .agentSessionListeners ?? new Map<string, Set<() => void>>();
const agentStoreListeners: Set<() => void> =
  import.meta.hot?.data.agentStoreListeners ?? new Set<() => void>();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.agentSessionStoreState = agentSessionStoreState;
    data.agentSessionListeners = agentSessionListeners;
    data.agentStoreListeners = agentStoreListeners;
  });
}

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

function writeAgentSessionStore(
  affectedSessionIds: readonly string[],
  updater: (state: typeof agentSessionStoreState) => typeof agentSessionStoreState,
): void {
  const nextState = updater(agentSessionStoreState);
  if (nextState === agentSessionStoreState) {
    return;
  }

  agentSessionStoreState = nextState;
  emitAgentStoreChange(affectedSessionIds);
}

export function recordAgentSessionEvent(event: AgentEvent): void {
  const affectedSessionIds =
    event.kind === "agent.session.created" || event.kind === "agent.session.updated"
      ? [event.session.id]
      : "sessionId" in event
        ? [event.sessionId]
        : [];

  if (affectedSessionIds.length === 0) {
    return;
  }

  writeAgentSessionStore(affectedSessionIds, (state) => reduceAgentSessionEvent(state, event));
}

export function clearAgentSessionResponseReady(sessionId: string): void {
  writeAgentSessionStore([sessionId], (state) =>
    clearSharedAgentSessionResponseReady(state, sessionId),
  );
}

export function clearWorkspaceAgentResponseReady(workspaceId: string): void {
  const affectedSessionIds = Object.entries(agentSessionStoreState.sessionsById)
    .filter(
      ([, sessionState]) => sessionState.workspaceId === workspaceId && sessionState.responseReady,
    )
    .map(([sessionId]) => sessionId);

  if (affectedSessionIds.length === 0) {
    return;
  }

  writeAgentSessionStore(affectedSessionIds, (state) =>
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
  useSyncExternalStore(
    subscribeAgentStore,
    () => agentSessionStoreState,
    () => agentSessionStoreState,
  );

  return {
    clearAgentSessionResponseReady,
    clearWorkspaceAgentResponseReady,
    hasWorkspaceResponseReady: (workspaceId: string) =>
      selectAgentWorkspaceStatus(agentSessionStoreState, workspaceId).responseReady,
    hasWorkspaceRunningTurn: (workspaceId: string) =>
      selectAgentWorkspaceStatus(agentSessionStoreState, workspaceId).running,
    isAgentSessionResponseReady: (sessionId: string) =>
      selectAgentSessionResponseReady(agentSessionStoreState, sessionId),
    isAgentSessionRunning: (sessionId: string) =>
      selectAgentSessionRunning(agentSessionStoreState, sessionId),
  };
}

export function useAgentSessionState(sessionId: string): AgentSessionState {
  return useSyncExternalStore(
    (listener: () => void) => {
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
    () => selectAgentSessionState(agentSessionStoreState, sessionId),
    () => selectAgentSessionState(agentSessionStoreState, sessionId),
  );
}

export function resetAgentSessionStoreForTests(): void {
  agentSessionStoreState = createAgentSessionStore();
  agentSessionListeners.clear();
  agentStoreListeners.clear();
}
