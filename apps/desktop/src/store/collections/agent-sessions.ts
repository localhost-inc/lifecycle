import type { AgentSessionRecord } from "@lifecycle/contracts";
import {
  createSqlCollection,
  selectAgentSessionsByWorkspace,
  type SqlCollection,
  type SqlDriver,
} from "@lifecycle/store";

const agentSessionCollections: Map<string, SqlCollection<AgentSessionRecord>> =
  (import.meta.hot?.data.agentSessionCollections as typeof agentSessionCollections) ??
  new Map<string, SqlCollection<AgentSessionRecord>>();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.agentSessionCollections = agentSessionCollections;
  });
}

export function getOrCreateAgentSessionCollection(
  driver: SqlDriver,
  workspaceId: string,
): SqlCollection<AgentSessionRecord> {
  let existing = agentSessionCollections.get(workspaceId);
  if (!existing) {
    existing = createSqlCollection<AgentSessionRecord>({
      id: `agent-sessions-${workspaceId}`,
      driver,
      loadFn: (runtimeDriver) => selectAgentSessionsByWorkspace(runtimeDriver, workspaceId),
      getKey: (session) => session.id,
    });
    agentSessionCollections.set(workspaceId, existing);
  }

  return existing;
}

export function refreshAgentSessionCollection(workspaceId: string): void {
  const existing = agentSessionCollections.get(workspaceId);
  if (existing) {
    void existing.refresh();
  }
}

export function upsertAgentSessionInCollection(
  driver: SqlDriver,
  workspaceId: string,
  session: AgentSessionRecord,
): void {
  getOrCreateAgentSessionCollection(driver, workspaceId).upsert(session);
}
