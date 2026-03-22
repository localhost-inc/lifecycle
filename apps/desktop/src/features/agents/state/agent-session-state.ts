import { useSyncExternalStore } from "react";
import type { AgentEvent, AgentMessagePart, AgentMessageRole } from "@lifecycle/agents";

interface AgentMessagePartEntry {
  id: string;
  part: AgentMessagePart;
}

export interface AgentMessageEntry {
  id: string;
  parts: AgentMessagePartEntry[];
  role: AgentMessageRole;
}

export interface AgentSessionState {
  events: AgentEvent[];
  last_error: string | null;
  messages: AgentMessageEntry[];
  pending_turn_ids: string[];
}

const DEFAULT_AGENT_SESSION_STATE: AgentSessionState = {
  events: [],
  last_error: null,
  messages: [],
  pending_turn_ids: [],
};

const agentSessionStates = new Map<string, AgentSessionState>();
const agentSessionListeners = new Map<string, Set<() => void>>();

function cloneAgentMessage(message: AgentMessageEntry): AgentMessageEntry {
  return {
    ...message,
    parts: message.parts.map((part) => ({ ...part })),
  };
}

function cloneAgentSessionState(state: AgentSessionState): AgentSessionState {
  return {
    events: [...state.events],
    last_error: state.last_error,
    messages: state.messages.map(cloneAgentMessage),
    pending_turn_ids: [...state.pending_turn_ids],
  };
}

function getAgentSessionStateInternal(sessionId: string): AgentSessionState {
  return agentSessionStates.get(sessionId) ?? DEFAULT_AGENT_SESSION_STATE;
}

function writeAgentSessionState(
  sessionId: string,
  updater: (state: AgentSessionState) => AgentSessionState,
): void {
  const nextState = updater(cloneAgentSessionState(getAgentSessionStateInternal(sessionId)));
  agentSessionStates.set(sessionId, nextState);

  for (const listener of agentSessionListeners.get(sessionId) ?? []) {
    listener();
  }
}

function appendMessagePart(
  messages: AgentMessageEntry[],
  input: { message_id: string; part: AgentMessagePart; part_id: string },
): AgentMessageEntry[] {
  return messages.map((message) => {
    if (message.id !== input.message_id) {
      return message;
    }

    const nextParts = [...message.parts];
    const partIndex = nextParts.findIndex((part) => part.id === input.part_id);
    const nextPart = { id: input.part_id, part: input.part };

    if (partIndex >= 0) {
      nextParts[partIndex] = nextPart;
    } else {
      nextParts.push(nextPart);
    }

    return {
      ...message,
      parts: nextParts,
    };
  });
}

export function recordAgentEvent(event: AgentEvent): void {
  if (!("session_id" in event) && event.kind !== "agent.session.created") {
    return;
  }

  const sessionId = event.kind === "agent.session.created" ? event.session.id : event.session_id;

  writeAgentSessionState(sessionId, (state) => {
    const nextState: AgentSessionState = {
      ...state,
      events: [...state.events, event],
    };

    if (event.kind === "agent.turn.started") {
      nextState.pending_turn_ids = [...new Set([...state.pending_turn_ids, event.turn_id])];
      nextState.last_error = null;
      return nextState;
    }

    if (event.kind === "agent.turn.completed") {
      nextState.pending_turn_ids = state.pending_turn_ids.filter(
        (turnId) => turnId !== event.turn_id,
      );
      return nextState;
    }

    if (event.kind === "agent.turn.failed") {
      nextState.last_error = event.error;
      nextState.pending_turn_ids = state.pending_turn_ids.filter(
        (turnId) => turnId !== event.turn_id,
      );
      return nextState;
    }

    if (event.kind === "agent.message.created") {
      nextState.messages = [
        ...state.messages,
        {
          id: event.message_id,
          parts: [],
          role: event.role,
        },
      ];
      return nextState;
    }

    if (
      event.kind === "agent.message.part.completed" ||
      event.kind === "agent.message.part.delta"
    ) {
      nextState.messages = appendMessagePart(state.messages, {
        message_id: event.message_id,
        part: event.part,
        part_id: event.part_id,
      });
      return nextState;
    }

    return nextState;
  });
}

export function recordLocalAgentUserMessage(input: {
  session_id: string;
  text: string;
  turn_id: string;
  workspace_id: string;
}): void {
  const messageId = `${input.turn_id}:user`;

  writeAgentSessionState(input.session_id, (state) => ({
    ...state,
    messages: [
      ...state.messages,
      {
        id: messageId,
        parts: [{ id: `${messageId}:part:1`, part: { type: "text", text: input.text } }],
        role: "user",
      },
    ],
  }));
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
    () => getAgentSessionStateInternal(sessionId),
    () => getAgentSessionStateInternal(sessionId),
  );
}

export function resetAgentSessionStateForTests(): void {
  agentSessionStates.clear();
  agentSessionListeners.clear();
}
