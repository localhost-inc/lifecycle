import type { AgentEvent } from "./events";
import type { AgentApprovalRequest } from "./turn";

export interface AgentFleetAuthStatus {
  mode: "authenticating" | "error" | "ready";
  provider: string;
}

export interface AgentFleetSessionState {
  authStatus: AgentFleetAuthStatus | null;
  lastError: string | null;
  pendingApprovals: AgentApprovalRequest[];
  pendingTurnIds: string[];
  providerStatus: string | null;
  responseReady: boolean;
  workspaceId: string | null;
}

export interface AgentFleetState {
  sessionsById: Record<string, AgentFleetSessionState>;
}

export interface AgentWorkspaceStatus {
  responseReady: boolean;
  running: boolean;
}

export const DEFAULT_AGENT_FLEET_SESSION_STATE: AgentFleetSessionState = {
  authStatus: null,
  lastError: null,
  pendingApprovals: [],
  pendingTurnIds: [],
  providerStatus: null,
  responseReady: false,
  workspaceId: null,
};

export function createAgentFleetState(): AgentFleetState {
  return {
    sessionsById: {},
  };
}

function withSessionState(
  state: AgentFleetState,
  sessionId: string,
  updater: (sessionState: AgentFleetSessionState) => AgentFleetSessionState,
): AgentFleetState {
  const previousSessionState = state.sessionsById[sessionId] ?? DEFAULT_AGENT_FLEET_SESSION_STATE;
  const nextSessionState = updater(previousSessionState);

  if (nextSessionState === previousSessionState) {
    return state;
  }

  return {
    ...state,
    sessionsById: {
      ...state.sessionsById,
      [sessionId]: nextSessionState,
    },
  };
}

export function reduceAgentFleetEvent(state: AgentFleetState, event: AgentEvent): AgentFleetState {
  if (!("sessionId" in event) && event.kind !== "agent.session.created") {
    return state;
  }

  const sessionId = event.kind === "agent.session.created" ? event.session.id : event.sessionId;

  return withSessionState(state, sessionId, (sessionState) => {
    const nextSessionState: AgentFleetSessionState = {
      ...sessionState,
      workspaceId: event.workspaceId,
    };

    if (event.kind === "agent.auth.updated") {
      if (event.mode === "authenticating") {
        return {
          ...nextSessionState,
          authStatus: { mode: "authenticating", provider: event.provider },
        };
      }
      if (event.mode === "error") {
        return {
          ...nextSessionState,
          authStatus: { mode: "error", provider: event.provider },
        };
      }
      return { ...nextSessionState, authStatus: null };
    }

    if (event.kind === "agent.status.updated") {
      return { ...nextSessionState, providerStatus: event.status };
    }

    if (event.kind === "agent.turn.started") {
      return {
        ...nextSessionState,
        lastError: null,
        pendingTurnIds: [...new Set([...nextSessionState.pendingTurnIds, event.turnId])],
        providerStatus: null,
        responseReady: false,
      };
    }

    if (event.kind === "agent.turn.completed") {
      return {
        ...nextSessionState,
        pendingApprovals: [],
        pendingTurnIds: nextSessionState.pendingTurnIds.filter((id) => id !== event.turnId),
        providerStatus: null,
        responseReady: true,
      };
    }

    if (event.kind === "agent.turn.failed") {
      return {
        ...nextSessionState,
        lastError: event.error,
        pendingApprovals: [],
        pendingTurnIds: nextSessionState.pendingTurnIds.filter((id) => id !== event.turnId),
        providerStatus: null,
        responseReady: false,
      };
    }

    if (event.kind === "agent.approval.requested") {
      return {
        ...nextSessionState,
        pendingApprovals: [
          ...nextSessionState.pendingApprovals.filter((approval) => approval.id !== event.approval.id),
          event.approval,
        ],
        providerStatus: null,
      };
    }

    if (event.kind === "agent.approval.resolved") {
      return {
        ...nextSessionState,
        pendingApprovals: nextSessionState.pendingApprovals.filter(
          (approval) => approval.id !== event.resolution.approvalId,
        ),
        providerStatus: null,
      };
    }

    return nextSessionState;
  });
}

export function selectAgentFleetSessionState(
  state: AgentFleetState,
  sessionId: string,
): AgentFleetSessionState {
  return state.sessionsById[sessionId] ?? DEFAULT_AGENT_FLEET_SESSION_STATE;
}

export function selectAgentSessionRunning(state: AgentFleetState, sessionId: string): boolean {
  return selectAgentFleetSessionState(state, sessionId).pendingTurnIds.length > 0;
}

export function selectAgentSessionResponseReady(
  state: AgentFleetState,
  sessionId: string,
): boolean {
  return selectAgentFleetSessionState(state, sessionId).responseReady;
}

export function selectAgentWorkspaceStatus(
  state: AgentFleetState,
  workspaceId: string,
): AgentWorkspaceStatus {
  let responseReady = false;
  let running = false;

  for (const sessionState of Object.values(state.sessionsById)) {
    if (sessionState.workspaceId !== workspaceId) {
      continue;
    }

    responseReady ||= sessionState.responseReady;
    running ||= sessionState.pendingTurnIds.length > 0;

    if (responseReady && running) {
      break;
    }
  }

  return { responseReady, running };
}

export function clearAgentSessionResponseReady(
  state: AgentFleetState,
  sessionId: string,
): AgentFleetState {
  const sessionState = selectAgentFleetSessionState(state, sessionId);
  if (!sessionState.responseReady) {
    return state;
  }

  return withSessionState(state, sessionId, (currentSessionState) => ({
    ...currentSessionState,
    responseReady: false,
  }));
}

export function clearAgentWorkspaceResponseReady(
  state: AgentFleetState,
  workspaceId: string,
): AgentFleetState {
  let nextState = state;

  for (const [sessionId, sessionState] of Object.entries(state.sessionsById)) {
    if (sessionState.workspaceId !== workspaceId || !sessionState.responseReady) {
      continue;
    }

    nextState = clearAgentSessionResponseReady(nextState, sessionId);
  }

  return nextState;
}
