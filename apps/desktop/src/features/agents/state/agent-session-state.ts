import { useSyncExternalStore } from "react";
import type { AgentApprovalRequest, AgentEvent } from "@lifecycle/agents";

export interface AgentAuthStatus {
  mode: "authenticating" | "error" | "ready";
  provider: string;
}

/**
 * Lightweight session-level state. Messages are NOT stored here —
 * they live in the DB and are read via the TanStack collection.
 */
export interface AgentSessionState {
  auth_status: AgentAuthStatus | null;
  last_error: string | null;
  pending_approvals: AgentApprovalRequest[];
  pending_turn_ids: string[];
  provider_status: string | null;
}

const DEFAULT_AGENT_SESSION_STATE: AgentSessionState = {
  auth_status: null,
  last_error: null,
  pending_approvals: [],
  pending_turn_ids: [],
  provider_status: null,
};

const agentSessionStates = new Map<string, AgentSessionState>();
const agentSessionListeners = new Map<string, Set<() => void>>();

function getAgentSessionStateInternal(sessionId: string): AgentSessionState {
  return agentSessionStates.get(sessionId) ?? DEFAULT_AGENT_SESSION_STATE;
}

function writeAgentSessionState(
  sessionId: string,
  updater: (state: AgentSessionState) => AgentSessionState,
): void {
  const prev = getAgentSessionStateInternal(sessionId);
  const nextState = updater({ ...prev });
  agentSessionStates.set(sessionId, nextState);

  for (const listener of agentSessionListeners.get(sessionId) ?? []) {
    listener();
  }
}

export function recordAgentEvent(event: AgentEvent): void {
  if (!("session_id" in event) && event.kind !== "agent.session.created") {
    return;
  }

  const sessionId = event.kind === "agent.session.created" ? event.session.id : event.session_id;

  writeAgentSessionState(sessionId, (state) => {
    if (event.kind === "agent.auth.updated") {
      if (event.mode === "authenticating") {
        return { ...state, auth_status: { mode: "authenticating", provider: event.provider } };
      }
      if (event.mode === "error") {
        return { ...state, auth_status: { mode: "error", provider: event.provider } };
      }
      return { ...state, auth_status: null };
    }

    if (event.kind === "agent.status.updated") {
      return { ...state, provider_status: event.status };
    }

    if (event.kind === "agent.turn.started") {
      return {
        ...state,
        provider_status: null,
        pending_turn_ids: [...new Set([...state.pending_turn_ids, event.turn_id])],
        last_error: null,
      };
    }

    if (event.kind === "agent.turn.completed") {
      return {
        ...state,
        pending_approvals: [],
        provider_status: null,
        pending_turn_ids: state.pending_turn_ids.filter((id) => id !== event.turn_id),
      };
    }

    if (event.kind === "agent.turn.failed") {
      return {
        ...state,
        pending_approvals: [],
        provider_status: null,
        last_error: event.error,
        pending_turn_ids: state.pending_turn_ids.filter((id) => id !== event.turn_id),
      };
    }

    if (event.kind === "agent.approval.requested") {
      const nextPending = [
        ...state.pending_approvals.filter((approval) => approval.id !== event.approval.id),
        event.approval,
      ];
      return {
        ...state,
        pending_approvals: nextPending,
        provider_status: null,
      };
    }

    if (event.kind === "agent.approval.resolved") {
      return {
        ...state,
        pending_approvals: state.pending_approvals.filter(
          (approval) => approval.id !== event.resolution.approval_id,
        ),
        provider_status: null,
      };
    }

    return state;
  });
}

export function useAgentSessionState(sessionId: string): AgentSessionState {
  return useSyncExternalStore(
    (listener) => {
      const listeners = agentSessionListeners.get(sessionId) ?? new Set<() => void>();
      listeners.add(listener);
      agentSessionListeners.set(sessionId, listeners);

      return () => {
        const nextListeners = agentSessionListeners.get(sessionId);
        if (!nextListeners) return;
        nextListeners.delete(listener);
        if (nextListeners.size === 0) {
          agentSessionListeners.delete(sessionId);
        }
      };
    },
    () => getAgentSessionStateInternal(sessionId),
    () => getAgentSessionStateInternal(sessionId),
  );
}

export function resetAgentSessionStateForTests(): void {
  agentSessionStates.clear();
  agentSessionListeners.clear();
}
