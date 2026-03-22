import type { AgentSessionRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "../driver";

export async function selectAgentSessionsByWorkspace(
  driver: SqlDriver,
  workspaceId: string,
): Promise<AgentSessionRecord[]> {
  return driver.select<AgentSessionRecord>(
    `SELECT id, workspace_id, runtime_kind, runtime_name, backend, runtime_session_id,
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
    `SELECT id, workspace_id, runtime_kind, runtime_name, backend, runtime_session_id,
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
    backend: string;
    runtime_session_id: string | null;
    title: string;
    status: string;
    created_by: string | null;
    forked_from_session_id: string | null;
  },
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent_session (id, workspace_id, runtime_kind, runtime_name, backend,
       runtime_session_id, title, status, created_by, forked_from_session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      session.id,
      session.workspace_id,
      session.runtime_kind,
      session.runtime_name,
      session.backend,
      session.runtime_session_id,
      session.title,
      session.status,
      session.created_by,
      session.forked_from_session_id,
    ],
  );
}
