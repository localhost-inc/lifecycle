import type { AgentMessageWithParts } from "@lifecycle/contracts";
import {
  createSqlCollection,
  selectAgentMessagesBySession,
  type SqlCollection,
  type SqlDriver,
} from "@lifecycle/store";

const agentMessageCollections: Map<string, SqlCollection<AgentMessageWithParts>> = (import.meta.hot
  ?.data.agentMessageCollections as typeof agentMessageCollections) ??
new Map<string, SqlCollection<AgentMessageWithParts>>();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.agentMessageCollections = agentMessageCollections;
  });
}

export function getOrCreateAgentMessageCollection(
  driver: SqlDriver,
  sessionId: string,
): SqlCollection<AgentMessageWithParts> {
  let existing = agentMessageCollections.get(sessionId);
  if (!existing) {
    existing = createSqlCollection<AgentMessageWithParts>({
      id: `agent-messages-${sessionId}`,
      driver,
      loadFn: (runtimeDriver) => selectAgentMessagesBySession(runtimeDriver, sessionId),
      getKey: (message) => message.id,
    });
    agentMessageCollections.set(sessionId, existing);
  }

  return existing;
}

/** Push a single message into the collection's sync layer. Instant, no SQL. */
export function upsertAgentMessageInCollection(
  driver: SqlDriver,
  sessionId: string,
  message: AgentMessageWithParts,
): void {
  getOrCreateAgentMessageCollection(driver, sessionId).utils.upsert(message);
}
