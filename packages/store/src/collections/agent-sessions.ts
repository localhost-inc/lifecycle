import type { AgentSessionRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "../driver";

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
