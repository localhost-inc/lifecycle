import type { SqlDriver, SqlStatement } from "@lifecycle/db";
import type { AgentRecord } from "@lifecycle/contracts";
import { createSqlCollection, type SqlCollection } from "../collection";

export type AgentCollectionRegistry = Map<string, SqlCollection<AgentRecord>>;

export async function selectAgentsByWorkspace(
  driver: SqlDriver,
  workspaceId: string,
): Promise<AgentRecord[]> {
  return driver.select<AgentRecord>(
    `SELECT id, workspace_id, provider, provider_id,
            title, status, last_message_at, created_at, updated_at
     FROM agent WHERE workspace_id = $1
     ORDER BY created_at ASC`,
    [workspaceId],
  );
}

export async function selectAgentById(
  driver: SqlDriver,
  agentId: string,
): Promise<AgentRecord | undefined> {
  const rows = await driver.select<AgentRecord>(
    `SELECT id, workspace_id, provider, provider_id,
            title, status, last_message_at, created_at, updated_at
     FROM agent WHERE id = $1`,
    [agentId],
  );
  return rows[0];
}

export async function insertAgent(
  driver: SqlDriver,
  agent: {
    id: string;
    workspace_id: string;
    provider: string;
    provider_id: string | null;
    title: string;
    status: string;
  },
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent (id, workspace_id, provider,
       provider_id, title, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      agent.id,
      agent.workspace_id,
      agent.provider,
      agent.provider_id,
      agent.title,
      agent.status,
    ],
  );
}

export async function upsertAgent(
  driver: SqlDriver,
  agent: AgentRecord,
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent (
       id, workspace_id, provider, provider_id,
       title, status, last_message_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       provider = excluded.provider,
       provider_id = excluded.provider_id,
       title = excluded.title,
       status = excluded.status,
       last_message_at = excluded.last_message_at,
       updated_at = excluded.updated_at`,
    [
      agent.id,
      agent.workspace_id,
      agent.provider,
      agent.provider_id,
      agent.title,
      agent.status,
      agent.last_message_at,
      agent.created_at,
      agent.updated_at,
    ],
  );
}

function upsertAgentStatement(agent: AgentRecord): SqlStatement {
  return {
    sql: `INSERT INTO agent (
           id, workspace_id, provider, provider_id,
           title, status, last_message_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           provider = excluded.provider,
           provider_id = excluded.provider_id,
           title = excluded.title,
           status = excluded.status,
           last_message_at = excluded.last_message_at,
           updated_at = excluded.updated_at`,
    params: [
      agent.id,
      agent.workspace_id,
      agent.provider,
      agent.provider_id,
      agent.title,
      agent.status,
      agent.last_message_at,
      agent.created_at,
      agent.updated_at,
    ],
  };
}

export function createAgentCollection(
  driver: SqlDriver,
  workspaceId: string,
): SqlCollection<AgentRecord> {
  return createSqlCollection<AgentRecord>({
    id: `agents-${workspaceId}`,
    driver,
    loadFn: (runtimeDriver) => selectAgentsByWorkspace(runtimeDriver, workspaceId),
    getKey: (agent) => agent.id,
    onInsert: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => upsertAgentStatement(mutation.modified)),
      );
    },
    onUpdate: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => upsertAgentStatement(mutation.modified)),
      );
    },
  });
}

export function createAgentCollectionRegistry(): AgentCollectionRegistry {
  return new Map<string, SqlCollection<AgentRecord>>();
}

export function getOrCreateAgentCollection(
  registry: AgentCollectionRegistry,
  driver: SqlDriver,
  workspaceId: string,
): SqlCollection<AgentRecord> {
  let collection = registry.get(workspaceId);
  if (!collection) {
    collection = createAgentCollection(driver, workspaceId);
    registry.set(workspaceId, collection);
  }

  return collection;
}

export function refreshAgentCollection(
  registry: AgentCollectionRegistry,
  workspaceId: string,
): void {
  const collection = registry.get(workspaceId);
  if (collection) {
    void collection.utils.refresh();
  }
}

export function upsertAgentInCollection(
  registry: AgentCollectionRegistry,
  driver: SqlDriver,
  workspaceId: string,
  agent: AgentRecord,
): void {
  getOrCreateAgentCollection(registry, driver, workspaceId).utils.upsert(agent);
}

export async function saveAgent(
  registry: AgentCollectionRegistry,
  driver: SqlDriver,
  agent: AgentRecord,
): Promise<void> {
  const collection = getOrCreateAgentCollection(registry, driver, agent.workspace_id);
  const transaction =
    collection.get(agent.id) === undefined
      ? collection.insert(agent)
      : collection.update(agent.id, (draft) => {
          Object.assign(draft, agent);
        });
  await transaction.isPersisted.promise;
}
