import type { AgentEvent } from "../events";
import type { AgentApprovalRequest } from "../turn";

export interface AgentSessionAuthStatus {
  mode: "authenticating" | "error" | "ready";
  provider: string;
}

export type AgentTurnPhase = "thinking" | "responding" | "tool_use";

export interface AgentTurnActivity {
  /** What the agent is currently doing within the turn. */
  phase: AgentTurnPhase;
  /** Name of the tool currently being invoked, when phase is "tool_use". */
  toolName: string | null;
  /** Provider-stable tool call id for the current tool_use phase. */
  toolCallId?: string | null;
  /** Number of tool calls started so far in this turn. */
  toolCallCount: number;
}

export interface AgentSessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface AgentSessionState {
  authStatus: AgentSessionAuthStatus | null;
  lastError: string | null;
  pendingApprovals: AgentApprovalRequest[];
  pendingTurnIds: string[];
  providerStatus: string | null;
  responseReady: boolean;
  turnActivity: AgentTurnActivity | null;
  usage: AgentSessionUsage;
  workspaceId: string | null;
}

export interface AgentSessionStore {
  sessionsById: Record<string, AgentSessionState>;
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

export const DEFAULT_AGENT_SESSION_STATE: AgentSessionState = {
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

export function createAgentSessionStore(): AgentSessionStore {
  return {
    sessionsById: {},
  };
}

function withSessionState(
  state: AgentSessionStore,
  sessionId: string,
  updater: (sessionState: AgentSessionState) => AgentSessionState,
): AgentSessionStore {
  const previousSessionState = state.sessionsById[sessionId] ?? DEFAULT_AGENT_SESSION_STATE;
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

export function reduceAgentSessionEvent(
  state: AgentSessionStore,
  event: AgentEvent,
): AgentSessionStore {
  if (!("sessionId" in event) && event.kind !== "agent.session.created") {
    return state;
  }

  const sessionId = event.kind === "agent.session.created" ? event.session.id : event.sessionId;

  return withSessionState(state, sessionId, (sessionState) => {
    // Only spread a new object when we actually have fields to change.
    // This avoids allocating on high-frequency no-op events (e.g. consecutive
    // text deltas that don't change turnActivity).

    if (event.kind === "agent.auth.updated") {
      if (event.mode === "authenticating") {
        return {
          ...sessionState,
          workspaceId: event.workspaceId,
          authStatus: { mode: "authenticating", provider: event.provider },
        };
      }
      if (event.mode === "error") {
        return {
          ...sessionState,
          workspaceId: event.workspaceId,
          authStatus: { mode: "error", provider: event.provider },
        };
      }
      return { ...sessionState, workspaceId: event.workspaceId, authStatus: null };
    }

    if (event.kind === "agent.status.updated") {
      const nextProviderStatus =
        event.detail?.trim() || event.status.trim()
          ? event.detail?.trim()
            ? event.detail
            : event.status
          : null;
      if (
        sessionState.providerStatus === nextProviderStatus &&
        sessionState.workspaceId === event.workspaceId
      ) {
        return sessionState;
      }
      return {
        ...sessionState,
        workspaceId: event.workspaceId,
        providerStatus: nextProviderStatus,
      };
    }

    if (event.kind === "agent.turn.started") {
      return {
        ...sessionState,
        workspaceId: event.workspaceId,
        lastError: null,
        pendingTurnIds: [...new Set([...sessionState.pendingTurnIds, event.turnId])],
        providerStatus: null,
        responseReady: false,
        turnActivity: { phase: "thinking", toolName: null, toolCallCount: 0 },
      };
    }

    if (event.kind === "agent.turn.completed") {
      const prev = sessionState.usage;
      const turnUsage = event.usage;
      return {
        ...sessionState,
        workspaceId: event.workspaceId,
        pendingApprovals: [],
        // Sessions only support one active turn at a time. Clear the full pending
        // set here so a stale duplicate turn id cannot leave the UI spinning after
        // the response is already ready.
        pendingTurnIds: [],
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
        ...sessionState,
        workspaceId: event.workspaceId,
        lastError: event.error,
        pendingApprovals: [],
        pendingTurnIds: [],
        providerStatus: null,
        responseReady: false,
        turnActivity: null,
      };
    }

    if (
      event.kind === "agent.message.part.delta" ||
      event.kind === "agent.message.part.completed"
    ) {
      const activity = sessionState.turnActivity;
      if (activity) {
        if (event.part.type === "thinking") {
          if (activity.phase !== "thinking") {
            const { toolCallId: _toolCallId, ...restActivity } = activity;
            return {
              ...sessionState,
              workspaceId: event.workspaceId,
              turnActivity: { ...restActivity, phase: "thinking", toolName: null },
            };
          }
          // Phase already "thinking" — no state change needed.
          return sessionState.workspaceId === event.workspaceId ? sessionState : { ...sessionState, workspaceId: event.workspaceId };
        }
        if (event.part.type === "text") {
          if (activity.phase !== "responding") {
            const { toolCallId: _toolCallId, ...restActivity } = activity;
            return {
              ...sessionState,
              workspaceId: event.workspaceId,
              turnActivity: { ...restActivity, phase: "responding", toolName: null },
            };
          }
          // Phase already "responding" — no state change needed.
          return sessionState.workspaceId === event.workspaceId ? sessionState : { ...sessionState, workspaceId: event.workspaceId };
        }
        if (event.part.type === "tool_call") {
          const toolCallId = event.part.toolCallId;
          const toolName = event.part.toolName ?? activity.toolName;
          const isDuplicateToolCall =
            activity.phase === "tool_use" &&
            toolCallId !== undefined &&
            activity.toolCallId === toolCallId;
          if (isDuplicateToolCall) {
            // Same tool still running — no state change needed.
            return sessionState.workspaceId === event.workspaceId ? sessionState : { ...sessionState, workspaceId: event.workspaceId };
          }
          const isNewTool = activity.phase !== "tool_use" || activity.toolCallId !== toolCallId;
          if (!isNewTool) {
            return sessionState.workspaceId === event.workspaceId ? sessionState : { ...sessionState, workspaceId: event.workspaceId };
          }
          return {
            ...sessionState,
            workspaceId: event.workspaceId,
            turnActivity: {
              phase: "tool_use",
              toolName,
              ...(toolCallId ? { toolCallId } : {}),
              toolCallCount: activity.toolCallCount + 1,
            },
          };
        }
      }
      // No activity or unrecognized part type — no change.
      return sessionState.workspaceId === event.workspaceId ? sessionState : { ...sessionState, workspaceId: event.workspaceId };
    }

    if (event.kind === "agent.approval.requested") {
      return {
        ...sessionState,
        workspaceId: event.workspaceId,
        pendingApprovals: [
          ...sessionState.pendingApprovals.filter(
            (approval) => approval.id !== event.approval.id,
          ),
          event.approval,
        ],
        providerStatus: null,
      };
    }

    if (event.kind === "agent.approval.resolved") {
      return {
        ...sessionState,
        workspaceId: event.workspaceId,
        pendingApprovals: sessionState.pendingApprovals.filter(
          (approval) => approval.id !== event.resolution.approvalId,
        ),
        providerStatus: null,
      };
    }

    // Unknown event — only update workspaceId if needed.
    return sessionState.workspaceId === event.workspaceId
      ? sessionState
      : { ...sessionState, workspaceId: event.workspaceId };
  });
}

export function selectAgentSessionState(
  state: AgentSessionStore,
  sessionId: string,
): AgentSessionState {
  return state.sessionsById[sessionId] ?? DEFAULT_AGENT_SESSION_STATE;
}

export type AgentSessionDisplayStatus = "idle" | "working" | "waiting" | "failed";

/**
 * Single derived status for an agent session. Every UI indicator should read
 * from this rather than inspecting individual state fields.
 *
 * State machine:
 *   idle ←→ working
 *     ↕        ↕
 *   waiting  failed
 *
 * - idle:    ready for input, no active turn
 * - working: agent processing (thinking / responding / tool use)
 * - waiting: needs user action (approval or question)
 * - failed:  last turn failed (can retry with a new turn)
 */
export function deriveAgentDisplayStatus(session: AgentSessionState): AgentSessionDisplayStatus {
  if (session.pendingApprovals.length > 0) {
    return "waiting";
  }

  if (session.pendingTurnIds.length > 0) {
    return "working";
  }

  if (session.lastError !== null) {
    return "failed";
  }

  return "idle";
}

export function selectAgentSessionRunning(state: AgentSessionStore, sessionId: string): boolean {
  return selectAgentSessionState(state, sessionId).pendingTurnIds.length > 0;
}

export function selectAgentSessionResponseReady(
  state: AgentSessionStore,
  sessionId: string,
): boolean {
  return selectAgentSessionState(state, sessionId).responseReady;
}

export function selectAgentWorkspaceStatus(
  state: AgentSessionStore,
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
  state: AgentSessionStore,
  sessionId: string,
): AgentSessionStore {
  const sessionState = selectAgentSessionState(state, sessionId);
  if (!sessionState.responseReady) {
    return state;
  }

  return withSessionState(state, sessionId, (currentSessionState) => ({
    ...currentSessionState,
    responseReady: false,
  }));
}

export function clearAgentWorkspaceResponseReady(
  state: AgentSessionStore,
  workspaceId: string,
): AgentSessionStore {
  let nextState = state;

  for (const [sessionId, sessionState] of Object.entries(state.sessionsById)) {
    if (sessionState.workspaceId !== workspaceId || !sessionState.responseReady) {
      continue;
    }

    nextState = clearAgentSessionResponseReady(nextState, sessionId);
  }

  return nextState;
}
