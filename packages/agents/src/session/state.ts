import type { AgentApprovalRequest } from "@lifecycle/contracts";
import type { AgentEvent } from "../events";

export interface AgentAuthState {
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

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface AgentState {
  authStatus: AgentAuthState | null;
  lastError: string | null;
  pendingApprovals: AgentApprovalRequest[];
  pendingTurnIds: string[];
  providerStatus: string | null;
  responseReady: boolean;
  turnActivity: AgentTurnActivity | null;
  usage: AgentUsage;
  workspaceId: string | null;
}

export interface AgentStore {
  agentsById: Record<string, AgentState>;
}

export interface AgentWorkspaceStatus {
  responseReady: boolean;
  running: boolean;
}

export const DEFAULT_AGENT_USAGE: AgentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0,
};

export const DEFAULT_AGENT_STATE: AgentState = {
  authStatus: null,
  lastError: null,
  pendingApprovals: [],
  pendingTurnIds: [],
  providerStatus: null,
  responseReady: false,
  turnActivity: null,
  usage: { ...DEFAULT_AGENT_USAGE },
  workspaceId: null,
};

export function createAgentStore(): AgentStore {
  return {
    agentsById: {},
  };
}

function withAgentState(
  state: AgentStore,
  agentId: string,
  updater: (agentState: AgentState) => AgentState,
): AgentStore {
  const previousAgentState = state.agentsById[agentId] ?? DEFAULT_AGENT_STATE;
  const nextAgentState = updater(previousAgentState);

  if (nextAgentState === previousAgentState) {
    return state;
  }

  return {
    ...state,
    agentsById: {
      ...state.agentsById,
      [agentId]: nextAgentState,
    },
  };
}

export function reduceAgentEvent(
  state: AgentStore,
  event: AgentEvent,
): AgentStore {
  if (!("agentId" in event) && event.kind !== "agent.created" && event.kind !== "agent.updated") {
    return state;
  }

  const agentId =
    event.kind === "agent.created" || event.kind === "agent.updated"
      ? event.agent.id
      : event.agentId;

  return withAgentState(state, agentId, (agentState) => {
    // Only spread a new object when we actually have fields to change.
    // This avoids allocating on high-frequency no-op events (e.g. consecutive
    // text deltas that don't change turnActivity).

    if (event.kind === "agent.auth.updated") {
      if (event.mode === "authenticating") {
        return {
          ...agentState,
          workspaceId: event.workspaceId,
          authStatus: { mode: "authenticating", provider: event.provider },
        };
      }
      if (event.mode === "error") {
        return {
          ...agentState,
          workspaceId: event.workspaceId,
          authStatus: { mode: "error", provider: event.provider },
        };
      }
      return { ...agentState, workspaceId: event.workspaceId, authStatus: null };
    }

    if (event.kind === "agent.status.updated") {
      const nextProviderStatus =
        event.detail?.trim() || event.status.trim()
          ? event.detail?.trim()
            ? event.detail
            : event.status
          : null;
      if (
        agentState.providerStatus === nextProviderStatus &&
        agentState.workspaceId === event.workspaceId
      ) {
        return agentState;
      }
      return {
        ...agentState,
        workspaceId: event.workspaceId,
        providerStatus: nextProviderStatus,
      };
    }

    if (event.kind === "agent.turn.started") {
      return {
        ...agentState,
        workspaceId: event.workspaceId,
        lastError: null,
        pendingTurnIds: [...new Set([...agentState.pendingTurnIds, event.turnId])],
        providerStatus: null,
        responseReady: false,
        turnActivity: { phase: "thinking", toolName: null, toolCallCount: 0 },
      };
    }

    if (event.kind === "agent.turn.completed") {
      const prev = agentState.usage;
      const turnUsage = event.usage;
      return {
        ...agentState,
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
        ...agentState,
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
      const activity = agentState.turnActivity;
      if (activity) {
        if (event.part.type === "thinking") {
          if (activity.phase !== "thinking") {
            const { toolCallId: _toolCallId, ...restActivity } = activity;
            return {
              ...agentState,
              workspaceId: event.workspaceId,
              turnActivity: { ...restActivity, phase: "thinking", toolName: null },
            };
          }
          // Phase already "thinking" — no state change needed.
          return agentState.workspaceId === event.workspaceId
            ? agentState
            : { ...agentState, workspaceId: event.workspaceId };
        }
        if (event.part.type === "text") {
          if (activity.phase !== "responding") {
            const { toolCallId: _toolCallId, ...restActivity } = activity;
            return {
              ...agentState,
              workspaceId: event.workspaceId,
              turnActivity: { ...restActivity, phase: "responding", toolName: null },
            };
          }
          // Phase already "responding" — no state change needed.
          return agentState.workspaceId === event.workspaceId
            ? agentState
            : { ...agentState, workspaceId: event.workspaceId };
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
            return agentState.workspaceId === event.workspaceId
              ? agentState
              : { ...agentState, workspaceId: event.workspaceId };
          }
          const isNewTool = activity.phase !== "tool_use" || activity.toolCallId !== toolCallId;
          if (!isNewTool) {
            return agentState.workspaceId === event.workspaceId
              ? agentState
              : { ...agentState, workspaceId: event.workspaceId };
          }
          return {
            ...agentState,
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
      return agentState.workspaceId === event.workspaceId
        ? agentState
        : { ...agentState, workspaceId: event.workspaceId };
    }

    if (event.kind === "agent.approval.requested") {
      return {
        ...agentState,
        workspaceId: event.workspaceId,
        pendingApprovals: [
          ...agentState.pendingApprovals.filter((approval) => approval.id !== event.approval.id),
          event.approval,
        ],
        providerStatus: null,
      };
    }

    if (event.kind === "agent.approval.resolved") {
      return {
        ...agentState,
        workspaceId: event.workspaceId,
        pendingApprovals: agentState.pendingApprovals.filter(
          (approval) => approval.id !== event.resolution.approvalId,
        ),
        providerStatus: null,
      };
    }

    // Unknown event — only update workspaceId if needed.
    return agentState.workspaceId === event.workspaceId
      ? agentState
      : { ...agentState, workspaceId: event.workspaceId };
  });
}

export function selectAgentState(
  state: AgentStore,
  agentId: string,
): AgentState {
  return state.agentsById[agentId] ?? DEFAULT_AGENT_STATE;
}

export type AgentDisplayStatus = "idle" | "working" | "waiting" | "failed";

/**
 * Single derived status for an agent. Every UI indicator should read
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
export function deriveAgentDisplayStatus(agent: AgentState): AgentDisplayStatus {
  if (agent.pendingApprovals.length > 0) {
    return "waiting";
  }

  if (agent.pendingTurnIds.length > 0) {
    return "working";
  }

  if (agent.lastError !== null) {
    return "failed";
  }

  return "idle";
}

export function selectAgentRunning(state: AgentStore, agentId: string): boolean {
  return selectAgentState(state, agentId).pendingTurnIds.length > 0;
}

export function selectAgentResponseReady(
  state: AgentStore,
  agentId: string,
): boolean {
  return selectAgentState(state, agentId).responseReady;
}

export function selectAgentWorkspaceStatus(
  state: AgentStore,
  workspaceId: string,
): AgentWorkspaceStatus {
  let responseReady = false;
  let running = false;

  for (const agentState of Object.values(state.agentsById)) {
    if (agentState.workspaceId !== workspaceId) {
      continue;
    }

    responseReady ||= agentState.responseReady;
    running ||= agentState.pendingTurnIds.length > 0;

    if (responseReady && running) {
      break;
    }
  }

  return { responseReady, running };
}

export function clearAgentResponseReady(
  state: AgentStore,
  agentId: string,
): AgentStore {
  const agentState = selectAgentState(state, agentId);
  if (!agentState.responseReady) {
    return state;
  }

  return withAgentState(state, agentId, (currentAgentState) => ({
    ...currentAgentState,
    responseReady: false,
  }));
}

export function clearAgentWorkspaceResponseReady(
  state: AgentStore,
  workspaceId: string,
): AgentStore {
  let nextState = state;

  for (const [agentId, agentState] of Object.entries(state.agentsById)) {
    if (agentState.workspaceId !== workspaceId || !agentState.responseReady) {
      continue;
    }

    nextState = clearAgentResponseReady(nextState, agentId);
  }

  return nextState;
}
