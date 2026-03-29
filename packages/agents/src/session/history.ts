import type { AgentSessionRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import {
  insertAgentEvent,
  selectAgentSessionById,
  selectNextAgentEventIndex,
  upsertAgentMessageWithParts,
} from "@lifecycle/store";
import {
  upsertAgentMessageInCollection,
  type AgentMessageCollectionRegistry,
} from "@lifecycle/store/internal/agent-messages";
import {
  upsertAgentSessionInCollection,
  type AgentSessionCollectionRegistry,
} from "@lifecycle/store/internal/agent-sessions";
import type { AgentEvent, AgentEventObserver } from "../events";
import { AgentMessageProjection } from "./messages";

interface ObservedSessionMetadata {
  provider: AgentSessionRecord["provider"];
  providerSessionId: string | null;
  workspaceId: string;
}

interface AgentSessionHistoryState {
  metadataBySessionId: Map<string, ObservedSessionMetadata>;
  observedEventIndices: Map<string, number>;
  messageProjection: AgentMessageProjection;
  queuesBySessionId: Map<string, Promise<void>>;
}

interface AgentSessionHistoryHotState {
  states?: Map<string, AgentSessionHistoryState>;
}

const hotData = import.meta.hot?.data as AgentSessionHistoryHotState | undefined;
const statesByKey = hotData?.states ?? new Map<string, AgentSessionHistoryState>();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.states = statesByKey;
  });
}

const SKIP_PERSIST_EVENT_KINDS = new Set([
  "agent.message.part.delta",
  "agent.message.part.completed",
  "agent.status.updated",
]);

function eventSessionId(event: AgentEvent): string | null {
  if (event.kind === "agent.session.created" || event.kind === "agent.session.updated") {
    return event.session.id;
  }

  if ("sessionId" in event) {
    return event.sessionId;
  }

  return null;
}

function eventTurnId(event: AgentEvent): string | null {
  switch (event.kind) {
    case "agent.turn.started":
    case "agent.turn.completed":
    case "agent.turn.failed":
      return event.turnId;
    case "agent.message.created":
      return event.turnId;
    default:
      return null;
  }
}

function cacheSessionMetadata(
  state: AgentSessionHistoryState,
  sessionId: string,
  metadata: ObservedSessionMetadata,
): void {
  state.metadataBySessionId.set(sessionId, metadata);
}

async function getObservedSessionMetadata(
  driver: SqlDriver,
  state: AgentSessionHistoryState,
  sessionId: string,
): Promise<ObservedSessionMetadata | null> {
  const cached = state.metadataBySessionId.get(sessionId);
  if (cached) {
    return cached;
  }

  const session = await selectAgentSessionById(driver, sessionId);
  if (!session) {
    return null;
  }

  const metadata = {
    workspaceId: session.workspace_id,
    provider: session.provider,
    providerSessionId: session.provider_session_id,
  };
  cacheSessionMetadata(state, sessionId, metadata);
  return metadata;
}

async function nextObservedEventIndex(
  driver: SqlDriver,
  state: AgentSessionHistoryState,
  sessionId: string,
): Promise<number> {
  const cached = state.observedEventIndices.get(sessionId);
  if (typeof cached === "number") {
    const next = cached + 1;
    state.observedEventIndices.set(sessionId, next);
    return next;
  }

  const next = await selectNextAgentEventIndex(driver, sessionId);
  state.observedEventIndices.set(sessionId, next);
  return next;
}

async function persistObservedEvent(
  driver: SqlDriver,
  state: AgentSessionHistoryState,
  event: AgentEvent,
  now: () => string,
): Promise<void> {
  const sessionId = eventSessionId(event);
  if (!sessionId || SKIP_PERSIST_EVENT_KINDS.has(event.kind)) {
    return;
  }

  const metadata = await getObservedSessionMetadata(driver, state, sessionId);
  if (!metadata) {
    return;
  }

  const eventIndex = await nextObservedEventIndex(driver, state, sessionId);
  await insertAgentEvent(driver, {
    id: `${sessionId}:event:${String(eventIndex).padStart(6, "0")}`,
    session_id: sessionId,
    workspace_id: metadata.workspaceId,
    provider: metadata.provider,
    provider_session_id: metadata.providerSessionId,
    turn_id: eventTurnId(event),
    event_index: eventIndex,
    event_kind: event.kind,
    payload: JSON.stringify(event),
    created_at: now(),
  });
}

function enqueueObservedEvent(
  state: AgentSessionHistoryState,
  sessionId: string,
  task: () => Promise<void>,
): Promise<void> {
  const previous = state.queuesBySessionId.get(sessionId) ?? Promise.resolve();
  const next = previous
    .catch((error) => {
      console.error("[agent] previous queued event failed for session", sessionId, error);
    })
    .then(task);
  state.queuesBySessionId.set(sessionId, next);
  return next.finally(() => {
    if (state.queuesBySessionId.get(sessionId) === next) {
      state.queuesBySessionId.delete(sessionId);
    }
  });
}

function getOrCreateState(
  key: string,
  driver: SqlDriver,
  now: () => string,
): AgentSessionHistoryState {
  let state = statesByKey.get(key);
  if (!state) {
    state = {
      metadataBySessionId: new Map<string, ObservedSessionMetadata>(),
      observedEventIndices: new Map<string, number>(),
      messageProjection: new AgentMessageProjection({
        now,
        hasPersistedParts: async (messageId) => {
          const [row] = await driver.select<{ cnt: number }>(
            "SELECT COUNT(*) AS cnt FROM agent_message_part WHERE message_id = $1",
            [messageId],
          );
          return row?.cnt ?? 0;
        },
      }),
      queuesBySessionId: new Map<string, Promise<void>>(),
    };
    statesByKey.set(key, state);
  }

  return state;
}

export function createAgentSessionHistoryObserver(input: {
  agentMessageRegistry: AgentMessageCollectionRegistry;
  agentSessionRegistry: AgentSessionCollectionRegistry;
  driver: SqlDriver;
  now?: () => string;
  stateKey: string;
}): AgentEventObserver {
  const now = input.now ?? (() => new Date().toISOString());
  const state = getOrCreateState(input.stateKey, input.driver, now);

  return async (event) => {
    const sessionId = eventSessionId(event);

    const handle = async () => {
      if (event.kind === "agent.session.created" || event.kind === "agent.session.updated") {
        cacheSessionMetadata(state, event.session.id, {
          workspaceId: event.workspaceId,
          provider: event.session.provider,
          providerSessionId: event.session.provider_session_id,
        });
        upsertAgentSessionInCollection(input.agentSessionRegistry, input.driver, event.workspaceId, event.session);
      }

      await persistObservedEvent(input.driver, state, event, now);

      const message = await state.messageProjection.processEvent(event);
      if (message) {
        await upsertAgentMessageWithParts(input.driver, message);
        upsertAgentMessageInCollection(input.agentMessageRegistry, input.driver, message.session_id, message);
      }

      if (event.kind === "agent.session.updated") {
        const status = event.session.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          state.messageProjection.clearSession(event.session.id);
          state.metadataBySessionId.delete(event.session.id);
          state.observedEventIndices.delete(event.session.id);
        }
      }
    };

    if (!sessionId) {
      await handle();
      return;
    }

    await enqueueObservedEvent(state, sessionId, handle);
  };
}
