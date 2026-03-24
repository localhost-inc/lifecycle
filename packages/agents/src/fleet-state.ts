import type { AgentEvent } from "./events";
import type { AgentApprovalRequest } from "./turn";

export interface AgentFleetAuthStatus {
  mode: "authenticating" | "error" | "ready";
  provider: string;
}

export type AgentTurnPhase = "thinking" | "responding" | "tool_use";

export interface AgentTurnActivity {
  /** What the agent is currently doing within the turn. */
  phase: AgentTurnPhase;
  /** Name of the tool currently being invoked, when phase is "tool_use". */
  toolName: string | null;
  /** Number of tool calls started so far in this turn. */
  toolCallCount: number;
}

export interface AgentSessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface AgentFleetSessionState {
  authStatus: AgentFleetAuthStatus | null;
  lastError: string | null;
  pendingApprovals: AgentApprovalRequest[];
  pendingTurnIds: string[];
  providerStatus: string | null;
  responseReady: boolean;
  turnActivity: AgentTurnActivity | null;
  usage: AgentSessionUsage;
  workspaceId: string | null;
}

export interface AgentFleetState {
  sessionsById: Record<string, AgentFleetSessionState>;
}

export interface AgentWorkspaceStatus {
  responseReady: boolean;
  running: boolean;
}

export const DEFAULT_AGENT_SESSION_USAGE: AgentSessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0,
};

export const DEFAULT_AGENT_FLEET_SESSION_STATE: AgentFleetSessionState = {
  authStatus: null,
  lastError: null,
  pendingApprovals: [],
  pendingTurnIds: [],
  providerStatus: null,
  responseReady: false,
  turnActivity: null,
  usage: { ...DEFAULT_AGENT_SESSION_USAGE },
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
      return {
        ...nextSessionState,
        providerStatus: event.detail?.trim() ? event.detail : event.status,
      };
    }

    if (event.kind === "agent.turn.started") {
      return {
        ...nextSessionState,
        lastError: null,
        pendingTurnIds: [...new Set([...nextSessionState.pendingTurnIds, event.turnId])],
        providerStatus: null,
        responseReady: false,
        turnActivity: { phase: "thinking", toolName: null, toolCallCount: 0 },
      };
    }

    if (event.kind === "agent.turn.completed") {
      const prev = nextSessionState.usage;
      const turnUsage = event.usage;
      return {
        ...nextSessionState,
        pendingApprovals: [],
        pendingTurnIds: nextSessionState.pendingTurnIds.filter((id) => id !== event.turnId),
        providerStatus: null,
        responseReady: true,
        turnActivity: null,
        usage: turnUsage
          ? {
              inputTokens: prev.inputTokens + turnUsage.inputTokens,
              outputTokens: prev.outputTokens + turnUsage.outputTokens,
              cacheReadTokens: prev.cacheReadTokens + (turnUsage.cacheReadTokens ?? 0),
              costUsd: prev.costUsd + (event.costUsd ?? 0),
            }
          : prev,
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
        turnActivity: null,
      };
    }

    if (
      event.kind === "agent.message.part.delta" ||
      event.kind === "agent.message.part.completed"
    ) {
      const activity = nextSessionState.turnActivity;
      if (activity) {
        if (event.part.type === "thinking") {
          if (activity.phase !== "thinking") {
            return {
              ...nextSessionState,
              turnActivity: { ...activity, phase: "thinking", toolName: null },
            };
          }
        } else if (event.part.type === "text") {
          if (activity.phase !== "responding") {
            return {
              ...nextSessionState,
              turnActivity: { ...activity, phase: "responding", toolName: null },
            };
          }
        } else if (event.part.type === "tool_call") {
          const toolName = event.part.toolName ?? activity.toolName;
          const isNewTool = activity.phase !== "tool_use" || activity.toolName !== toolName;
          return {
            ...nextSessionState,
            turnActivity: {
              phase: "tool_use",
              toolName,
              toolCallCount: isNewTool ? activity.toolCallCount + 1 : activity.toolCallCount,
            },
          };
        }
      }
    }

    if (event.kind === "agent.approval.requested") {
      return {
        ...nextSessionState,
        pendingApprovals: [
          ...nextSessionState.pendingApprovals.filter(
            (approval) => approval.id !== event.approval.id,
          ),
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
