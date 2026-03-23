import type { AgentSessionRecord } from "@lifecycle/contracts";
import { createSqlCollection, selectAgentSessionsByWorkspace, type SqlCollection, type SqlDriver } from "@lifecycle/store";

const agentSessionCollections = new Map<string, SqlCollection<AgentSessionRecord>>();

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
