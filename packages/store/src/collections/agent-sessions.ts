import type { SqlDriver, SqlStatement } from "@lifecycle/db";
import type { AgentSessionRecord } from "@lifecycle/contracts";
import { createSqlCollection, type SqlCollection } from "../collection";

const agentSessionCollectionsByDriver = new WeakMap<
  SqlDriver,
  Map<string, SqlCollection<AgentSessionRecord>>
>();

export async function selectAgentSessionsByWorkspace(
  driver: SqlDriver,
  workspaceId: string,
): Promise<AgentSessionRecord[]> {
  return driver.select<AgentSessionRecord>(
    `SELECT id, workspace_id, provider, provider_session_id,
            title, status, last_message_at, created_at, updated_at
     FROM agent_session WHERE workspace_id = $1
     ORDER BY created_at ASC`,
    [workspaceId],
  );
}

export async function selectAgentSessionById(
  driver: SqlDriver,
  sessionId: string,
): Promise<AgentSessionRecord | undefined> {
  const rows = await driver.select<AgentSessionRecord>(
    `SELECT id, workspace_id, provider, provider_session_id,
            title, status, last_message_at, created_at, updated_at
     FROM agent_session WHERE id = $1`,
    [sessionId],
  );
  return rows[0];
}

export async function insertAgentSession(
  driver: SqlDriver,
  session: {
    id: string;
    workspace_id: string;
    provider: string;
    provider_session_id: string | null;
    title: string;
    status: string;
  },
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent_session (id, workspace_id, provider,
       provider_session_id, title, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      session.id,
      session.workspace_id,
      session.provider,
      session.provider_session_id,
      session.title,
      session.status,
    ],
  );
}

export async function upsertAgentSession(
  driver: SqlDriver,
  session: AgentSessionRecord,
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent_session (
       id, workspace_id, provider, provider_session_id,
       title, status, last_message_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       provider = excluded.provider,
       provider_session_id = excluded.provider_session_id,
       title = excluded.title,
       status = excluded.status,
       last_message_at = excluded.last_message_at,
       updated_at = excluded.updated_at`,
    [
      session.id,
      session.workspace_id,
      session.provider,
      session.provider_session_id,
      session.title,
      session.status,
      session.last_message_at,
      session.created_at,
      session.updated_at,
    ],
  );
}

function upsertAgentSessionStatement(session: AgentSessionRecord): SqlStatement {
  return {
    sql: `INSERT INTO agent_session (
           id, workspace_id, provider, provider_session_id,
           title, status, last_message_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           provider = excluded.provider,
           provider_session_id = excluded.provider_session_id,
           title = excluded.title,
           status = excluded.status,
           last_message_at = excluded.last_message_at,
           updated_at = excluded.updated_at`,
    params: [
      session.id,
      session.workspace_id,
      session.provider,
      session.provider_session_id,
      session.title,
      session.status,
      session.last_message_at,
      session.created_at,
      session.updated_at,
    ],
  };
}

export function createAgentSessionCollection(
  driver: SqlDriver,
  workspaceId: string,
): SqlCollection<AgentSessionRecord> {
  return createSqlCollection<AgentSessionRecord>({
    id: `agent-sessions-${workspaceId}`,
    driver,
    loadFn: (runtimeDriver) => selectAgentSessionsByWorkspace(runtimeDriver, workspaceId),
    getKey: (session) => session.id,
    onInsert: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => upsertAgentSessionStatement(mutation.modified)),
      );
    },
    onUpdate: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => upsertAgentSessionStatement(mutation.modified)),
      );
    },
  });
}

export function getOrCreateAgentSessionCollection(
  driver: SqlDriver,
  workspaceId: string,
): SqlCollection<AgentSessionRecord> {
  let collectionsByWorkspace = agentSessionCollectionsByDriver.get(driver);
  if (!collectionsByWorkspace) {
    collectionsByWorkspace = new Map<string, SqlCollection<AgentSessionRecord>>();
    agentSessionCollectionsByDriver.set(driver, collectionsByWorkspace);
  }

  let collection = collectionsByWorkspace.get(workspaceId);
  if (!collection) {
    collection = createAgentSessionCollection(driver, workspaceId);
    collectionsByWorkspace.set(workspaceId, collection);
  }

  return collection;
}

export function refreshAgentSessionCollection(driver: SqlDriver, workspaceId: string): void {
  const collection = agentSessionCollectionsByDriver.get(driver)?.get(workspaceId);
  if (collection) {
    void collection.utils.refresh();
  }
}

export function upsertAgentSessionInCollection(
  driver: SqlDriver,
  workspaceId: string,
  session: AgentSessionRecord,
): void {
  getOrCreateAgentSessionCollection(driver, workspaceId).utils.upsert(session);
}

export async function saveAgentSession(
  driver: SqlDriver,
  session: AgentSessionRecord,
): Promise<void> {
  const collection = getOrCreateAgentSessionCollection(driver, session.workspace_id);
  const transaction =
    collection.get(session.id) === undefined
      ? collection.insert(session)
      : collection.update(session.id, (draft) => {
          Object.assign(draft, session);
        });
  await transaction.isPersisted.promise;
}
