import type {
  AgentRecord,
  AgentEventRecord,
  AgentMessagePartRecord,
  AgentMessageRecord,
  AgentMessageWithParts,
} from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";

interface MessagePartRow {
  id: string;
  agent_id: string;
  role: string;
  text: string;
  turn_id: string | null;
  created_at: string;
  part_id: string | null;
  part_index: number | null;
  part_type: string | null;
  part_text: string | null;
  part_data: string | null;
  part_created_at: string | null;
}

function rowsToAgentMessages(rows: MessagePartRow[]): AgentMessageWithParts[] {
  const messagesMap = new Map<string, AgentMessageWithParts>();

  for (const row of rows) {
    let message = messagesMap.get(row.id);
    if (!message) {
      message = {
        id: row.id,
        agent_id: row.agent_id,
        role: row.role as AgentMessageWithParts["role"],
        text: row.text,
        turn_id: row.turn_id,
        parts: [],
        created_at: row.created_at,
      };
      messagesMap.set(row.id, message);
    }

    if (!row.part_id) {
      continue;
    }

    message.parts.push({
      id: row.part_id,
      message_id: row.id,
      agent_id: row.agent_id,
      part_index: row.part_index ?? 0,
      part_type: row.part_type as AgentMessagePartRecord["part_type"],
      text: row.part_text,
      data: row.part_data,
      created_at: row.part_created_at ?? row.created_at,
    });
  }

  return [...messagesMap.values()];
}

export async function selectActiveAgents(driver: SqlDriver): Promise<AgentRecord[]> {
  return driver.select<AgentRecord>(
    `SELECT id, workspace_id, provider, provider_id,
            title, status, last_message_at, created_at, updated_at
     FROM agent
     WHERE status NOT IN ('completed', 'failed', 'cancelled')
     ORDER BY created_at ASC`,
    [],
  );
}

export async function selectAgentsByWorkspace(
  driver: SqlDriver,
  workspaceId: string,
): Promise<AgentRecord[]> {
  return driver.select<AgentRecord>(
    `SELECT id, workspace_id, provider, provider_id,
            title, status, last_message_at, created_at, updated_at
     FROM agent
     WHERE workspace_id = $1
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
     FROM agent
     WHERE id = $1`,
    [agentId],
  );
  return rows[0];
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

export async function selectAgentMessagesByAgent(
  driver: SqlDriver,
  agentId: string,
): Promise<AgentMessageWithParts[]> {
  const rows = await driver.select<MessagePartRow>(
    `SELECT
       m.id,
       m.agent_id,
       m.role,
       m.text,
       m.turn_id,
       m.created_at,
       p.id AS part_id,
       p.part_index,
       p.part_type,
       p.text AS part_text,
       p.data AS part_data,
       p.created_at AS part_created_at
     FROM agent_message m
     LEFT JOIN agent_message_part p ON p.message_id = m.id
     WHERE m.agent_id = $1
     ORDER BY m.created_at ASC, m.id ASC, p.part_index ASC`,
    [agentId],
  );

  return rowsToAgentMessages(rows);
}

export async function selectAgentMessageById(
  driver: SqlDriver,
  messageId: string,
): Promise<AgentMessageWithParts | null> {
  const rows = await driver.select<MessagePartRow>(
    `SELECT
       m.id,
       m.agent_id,
       m.role,
       m.text,
       m.turn_id,
       m.created_at,
       p.id AS part_id,
       p.part_index,
       p.part_type,
       p.text AS part_text,
       p.data AS part_data,
       p.created_at AS part_created_at
     FROM agent_message m
     LEFT JOIN agent_message_part p ON p.message_id = m.id
     WHERE m.id = $1
     ORDER BY m.created_at ASC, m.id ASC, p.part_index ASC`,
    [messageId],
  );

  return rowsToAgentMessages(rows)[0] ?? null;
}

export async function upsertAgentMessage(
  driver: SqlDriver,
  message: AgentMessageRecord,
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent_message (id, agent_id, role, text, turn_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       agent_id = excluded.agent_id,
       role = excluded.role,
       text = excluded.text,
       turn_id = excluded.turn_id`,
    [
      message.id,
      message.agent_id,
      message.role,
      message.text,
      message.turn_id,
      message.created_at,
    ],
  );
}

export async function upsertAgentMessageWithParts(
  driver: SqlDriver,
  message: AgentMessageWithParts,
): Promise<void> {
  await upsertAgentMessage(driver, {
    id: message.id,
    agent_id: message.agent_id,
    role: message.role,
    text: message.text,
    turn_id: message.turn_id,
    created_at: message.created_at,
  });

  if (message.parts.length === 0) {
    return;
  }

  const columnsPerRow = 8;
  const placeholders: string[] = [];
  const params: unknown[] = [];

  for (let index = 0; index < message.parts.length; index += 1) {
    const part = message.parts[index]!;
    const offset = index * columnsPerRow;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`,
    );
    params.push(
      part.id,
      part.message_id,
      part.agent_id,
      part.part_index,
      part.part_type,
      part.text,
      part.data,
      part.created_at,
    );
  }

  await driver.execute(
    `INSERT OR REPLACE INTO agent_message_part (
       id, message_id, agent_id, part_index, part_type, text, data, created_at
     )
     VALUES ${placeholders.join(", ")}`,
    params,
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
