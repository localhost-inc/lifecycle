import type { SqlDriver } from "@lifecycle/db";
import type { AgentEventRecord } from "@lifecycle/contracts";

export async function selectAgentEventsByAgent(
  driver: SqlDriver,
  agentId: string,
): Promise<AgentEventRecord[]> {
  return driver.select<AgentEventRecord>(
    `SELECT id, agent_id, workspace_id, provider, provider_id, turn_id, event_index, event_kind, payload, created_at
     FROM agent_event
     WHERE agent_id = $1
     ORDER BY event_index ASC, created_at ASC, id ASC`,
    [agentId],
  );
}

export async function selectNextAgentEventIndex(
  driver: SqlDriver,
  agentId: string,
): Promise<number> {
  const rows = await driver.select<{ next_index: number }>(
    `SELECT COALESCE(MAX(event_index), 0) + 1 AS next_index
     FROM agent_event
     WHERE agent_id = $1`,
    [agentId],
  );

  return rows[0]?.next_index ?? 1;
}

export async function insertAgentEvent(driver: SqlDriver, event: AgentEventRecord): Promise<void> {
  await driver.execute(
    `INSERT INTO agent_event (
       id,
       agent_id,
       workspace_id,
       provider,
       provider_id,
       turn_id,
       event_index,
       event_kind,
       payload,
       created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.id,
      event.agent_id,
      event.workspace_id,
      event.provider,
      event.provider_id,
      event.turn_id,
      event.event_index,
      event.event_kind,
      event.payload,
      event.created_at,
    ],
  );
}
