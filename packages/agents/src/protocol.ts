import type {
  AgentItem,
  AgentItemDelta,
  AgentProviderRequest,
  AgentProviderRequestResolution,
  AgentProviderSignal,
} from "@lifecycle/contracts";
import type { AgentEvent } from "./events";

export interface AgentProtocolRequestState {
  request: AgentProviderRequest;
  resolution: AgentProviderRequestResolution | null;
}

export interface AgentProtocolTurnState {
  id: string;
  itemDeltasById: Record<string, AgentItemDelta[]>;
  itemsById: Record<string, AgentItem>;
  signals: AgentProviderSignal[];
  status: "completed" | "failed" | "running";
  textByPartId: Record<string, string>;
  thinkingByPartId: Record<string, string>;
}

export interface AgentProtocolState {
  requestsById: Record<string, AgentProtocolRequestState>;
  signals: AgentProviderSignal[];
  turnsById: Record<string, AgentProtocolTurnState>;
}

export const DEFAULT_AGENT_PROTOCOL_STATE: AgentProtocolState = {
  requestsById: {},
  signals: [],
  turnsById: {},
};

function ensureTurn(
  state: AgentProtocolState,
  turnId: string,
): AgentProtocolTurnState {
  return (
    state.turnsById[turnId] ?? {
      id: turnId,
      itemDeltasById: {},
      itemsById: {},
      signals: [],
      status: "running",
      textByPartId: {},
      thinkingByPartId: {},
    }
  );
}

function withTurn(
  state: AgentProtocolState,
  turnId: string,
  updater: (turn: AgentProtocolTurnState) => AgentProtocolTurnState,
): AgentProtocolState {
  const previous = ensureTurn(state, turnId);
  const next = updater(previous);
  if (next === previous) {
    return state;
  }

  return {
    ...state,
    turnsById: {
      ...state.turnsById,
      [turnId]: next,
    },
  };
}

function assistantTurnIdFromMessageId(messageId: string): string | null {
  return messageId.endsWith(":assistant") ? messageId.slice(0, -":assistant".length) : null;
}

export function reduceAgentProtocolEvent(
  state: AgentProtocolState,
  event: AgentEvent,
): AgentProtocolState {
  switch (event.kind) {
    case "agent.turn.started":
      return withTurn(state, event.turnId, (turn) => ({ ...turn, status: "running" }));
    case "agent.turn.completed":
      return withTurn(state, event.turnId, (turn) => ({ ...turn, status: "completed" }));
    case "agent.turn.failed":
      return withTurn(state, event.turnId, (turn) => ({ ...turn, status: "failed" }));
    case "agent.message.part.delta":
    case "agent.message.part.completed": {
      const turnId = assistantTurnIdFromMessageId(event.messageId);
      if (!turnId) {
        return state;
      }

      const part = event.part;

      if (part.type === "text") {
        const text = part.text;
        return withTurn(state, turnId, (turn) => ({
          ...turn,
          textByPartId: {
            ...turn.textByPartId,
            [event.partId]:
              event.kind === "agent.message.part.delta"
                ? `${turn.textByPartId[event.partId] ?? ""}${text}`
                : text,
          },
        }));
      }

      if (part.type === "thinking") {
        const text = part.text;
        return withTurn(state, turnId, (turn) => ({
          ...turn,
          thinkingByPartId: {
            ...turn.thinkingByPartId,
            [event.partId]:
              event.kind === "agent.message.part.delta"
                ? `${turn.thinkingByPartId[event.partId] ?? ""}${text}`
                : text,
          },
        }));
      }

      return state;
    }
    case "agent.item.started":
    case "agent.item.updated":
    case "agent.item.completed":
      return withTurn(state, event.turnId, (turn) => ({
        ...turn,
        itemsById: {
          ...turn.itemsById,
          [event.item.id]: event.item,
        },
      }));
    case "agent.item.delta":
      return withTurn(state, event.turnId, (turn) => ({
        ...turn,
        itemDeltasById: {
          ...turn.itemDeltasById,
          [event.delta.itemId]: [...(turn.itemDeltasById[event.delta.itemId] ?? []), event.delta],
        },
      }));
    case "agent.provider.signal":
      if (!event.turnId) {
        return {
          ...state,
          signals: [...state.signals, event.signal],
        };
      }

      return withTurn(state, event.turnId, (turn) => ({
        ...turn,
        signals: [...turn.signals, event.signal],
      }));
    case "agent.provider.requested":
      return {
        ...state,
        requestsById: {
          ...state.requestsById,
          [event.request.id]: {
            request: event.request,
            resolution: null,
          },
        },
      };
    case "agent.provider.request.resolved": {
      const existing = state.requestsById[event.resolution.requestId];
      if (!existing) {
        return {
          ...state,
          requestsById: {
            ...state.requestsById,
            [event.resolution.requestId]: {
              request: {
                id: event.resolution.requestId,
                kind: "other",
                title: event.resolution.requestId,
              },
              resolution: event.resolution,
            },
          },
        };
      }

      return {
        ...state,
        requestsById: {
          ...state.requestsById,
          [event.resolution.requestId]: {
            ...existing,
            resolution: event.resolution,
          },
        },
      };
    }
    default:
      return state;
  }
}

export class AgentProtocolStore {
  private state: AgentProtocolState;

  constructor(initialState: AgentProtocolState = DEFAULT_AGENT_PROTOCOL_STATE) {
    this.state = initialState;
  }

  apply(event: AgentEvent): AgentProtocolState {
    this.state = reduceAgentProtocolEvent(this.state, event);
    return this.state;
  }

  snapshot(): AgentProtocolState {
    return this.state;
  }
}

export function createAgentProtocolStore(
  initialState: AgentProtocolState = DEFAULT_AGENT_PROTOCOL_STATE,
): AgentProtocolStore {
  return new AgentProtocolStore(initialState);
}
