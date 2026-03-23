import type { AgentSessionRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "../driver";

export async function selectAgentSessionsByWorkspace(
  driver: SqlDriver,
  workspaceId: string,
): Promise<AgentSessionRecord[]> {
  return driver.select<AgentSessionRecord>(
    `SELECT id, workspace_id, runtime_kind, runtime_name, provider, provider_session_id,
            title, status, created_by, forked_from_session_id, last_message_at,
            created_at, updated_at, ended_at
     FROM agent_session WHERE workspace_id = $1
     ORDER BY updated_at DESC`,
    [workspaceId],
  );
}

export async function selectAgentSessionById(
  driver: SqlDriver,
  sessionId: string,
): Promise<AgentSessionRecord | undefined> {
  const rows = await driver.select<AgentSessionRecord>(
    `SELECT id, workspace_id, runtime_kind, runtime_name, provider, provider_session_id,
            title, status, created_by, forked_from_session_id, last_message_at,
            created_at, updated_at, ended_at
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
    runtime_kind: string;
    runtime_name: string | null;
    provider: string;
    provider_session_id: string | null;
    title: string;
    status: string;
    created_by: string | null;
    forked_from_session_id: string | null;
  },
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent_session (id, workspace_id, runtime_kind, runtime_name, provider,
       provider_session_id, title, status, created_by, forked_from_session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      session.id,
      session.workspace_id,
      session.runtime_kind,
      session.runtime_name,
      session.provider,
      session.provider_session_id,
      session.title,
      session.status,
      session.created_by,
      session.forked_from_session_id,
    ],
  );
}

export async function upsertAgentSession(
  driver: SqlDriver,
  session: AgentSessionRecord,
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent_session (
       id, workspace_id, runtime_kind, runtime_name, provider, provider_session_id,
       title, status, created_by, forked_from_session_id, last_message_at,
       created_at, updated_at, ended_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       runtime_kind = excluded.runtime_kind,
       runtime_name = excluded.runtime_name,
       provider = excluded.provider,
       provider_session_id = excluded.provider_session_id,
       title = excluded.title,
       status = excluded.status,
       created_by = excluded.created_by,
       forked_from_session_id = excluded.forked_from_session_id,
       last_message_at = excluded.last_message_at,
       updated_at = excluded.updated_at,
       ended_at = excluded.ended_at`,
    [
      session.id,
      session.workspace_id,
      session.runtime_kind,
      session.runtime_name,
      session.provider,
      session.provider_session_id,
      session.title,
      session.status,
      session.created_by,
      session.forked_from_session_id,
      session.last_message_at,
      session.created_at,
      session.updated_at,
      session.ended_at,
    ],
  );
}
