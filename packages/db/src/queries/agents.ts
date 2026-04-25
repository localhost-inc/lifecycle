import type {
  AgentEventRecord,
  AgentMessagePartRecord,
  AgentMessageRecord,
  AgentMessageWithParts,
  AgentRecord,
} from "@lifecycle/contracts";
import type { SqlDriver, SqlStatement } from "../types";

export interface AgentRow extends AgentRecord {}

export interface AgentMessageRow extends AgentMessageRecord {}

export interface AgentMessagePartRow extends AgentMessagePartRecord {}

export interface AgentEventRow extends AgentEventRecord {}

const AGENT_COLUMNS = `
  id, workspace_id, provider, provider_id, title, status, last_message_at, created_at, updated_at
`.trim();

const AGENT_MESSAGE_COLUMNS = `
  id, agent_id, role, text, turn_id, created_at
`.trim();

const AGENT_MESSAGE_PART_COLUMNS = `
  id, message_id, agent_id, part_index, part_type, text, data, created_at
`.trim();

const AGENT_EVENT_COLUMNS = `
  id, agent_id, workspace_id, provider, provider_id, turn_id, event_index, event_kind, payload, created_at
`.trim();

export async function listAgentsByWorkspace(
  db: SqlDriver,
  workspaceId: string,
): Promise<AgentRow[]> {
  return db.select<AgentRow>(
    `SELECT ${AGENT_COLUMNS}
       FROM agent
      WHERE workspace_id = $1
      ORDER BY updated_at DESC, created_at DESC, id DESC`,
    [workspaceId],
  );
}

export async function getAgentById(db: SqlDriver, agentId: string): Promise<AgentRow | undefined> {
  const rows = await db.select<AgentRow>(
    `SELECT ${AGENT_COLUMNS}
       FROM agent
      WHERE id = $1`,
    [agentId],
  );
  return rows[0];
}

export async function listAgentMessages(
  db: SqlDriver,
  agentId: string,
): Promise<AgentMessageRow[]> {
  return db.select<AgentMessageRow>(
    `SELECT ${AGENT_MESSAGE_COLUMNS}
       FROM agent_message
      WHERE agent_id = $1
      ORDER BY created_at ASC, id ASC`,
    [agentId],
  );
}

export async function listAgentMessageParts(
  db: SqlDriver,
  agentId: string,
): Promise<AgentMessagePartRow[]> {
  return db.select<AgentMessagePartRow>(
    `SELECT ${AGENT_MESSAGE_PART_COLUMNS}
       FROM agent_message_part
      WHERE agent_id = $1
      ORDER BY created_at ASC, part_index ASC, id ASC`,
    [agentId],
  );
}

export async function listAgentMessagesWithParts(
  db: SqlDriver,
  agentId: string,
): Promise<AgentMessageWithParts[]> {
  const [messages, parts] = await Promise.all([
    listAgentMessages(db, agentId),
    listAgentMessageParts(db, agentId),
  ]);
  const partsByMessageId = new Map<string, AgentMessagePartRow[]>();

  for (const part of parts) {
    const bucket = partsByMessageId.get(part.message_id);
    if (bucket) {
      bucket.push(part);
      continue;
    }
    partsByMessageId.set(part.message_id, [part]);
  }

  return messages.map((message) => ({
    ...message,
    parts:
      partsByMessageId
        .get(message.id)
        ?.slice()
        .sort((left, right) => {
          if (left.part_index === right.part_index) {
            return left.id.localeCompare(right.id);
          }
          return left.part_index - right.part_index;
        }) ?? [],
  }));
}

export async function listAgentEvents(db: SqlDriver, agentId: string): Promise<AgentEventRow[]> {
  return db.select<AgentEventRow>(
    `SELECT ${AGENT_EVENT_COLUMNS}
       FROM agent_event
      WHERE agent_id = $1
      ORDER BY event_index ASC`,
    [agentId],
  );
}

export async function selectMaxAgentEventIndex(db: SqlDriver, agentId: string): Promise<number> {
  const rows = await db.select<{ max_event_index: number | null }>(
    `SELECT MAX(event_index) AS max_event_index
       FROM agent_event
      WHERE agent_id = $1`,
    [agentId],
  );
  return rows[0]?.max_event_index ?? 0;
}

export function upsertAgentStatement(agent: AgentRecord): SqlStatement {
  return {
    sql: `INSERT INTO agent (
            id, workspace_id, provider, provider_id, title, status, last_message_at, created_at, updated_at
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

export async function upsertAgent(db: SqlDriver, agent: AgentRecord): Promise<void> {
  const statement = upsertAgentStatement(agent);
  await db.execute(statement.sql, statement.params);
}

export function replaceAgentMessageStatements(message: AgentMessageWithParts): SqlStatement[] {
  return [
    {
      sql: `INSERT INTO agent_message (id, agent_id, role, text, turn_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(id) DO UPDATE SET
              agent_id = excluded.agent_id,
              role = excluded.role,
              text = excluded.text,
              turn_id = excluded.turn_id,
              created_at = excluded.created_at`,
      params: [
        message.id,
        message.agent_id,
        message.role,
        message.text,
        message.turn_id,
        message.created_at,
      ],
    },
    {
      sql: "DELETE FROM agent_message_part WHERE message_id = $1",
      params: [message.id],
    },
    ...message.parts.map((part) => ({
      sql: `INSERT INTO agent_message_part (
              id, message_id, agent_id, part_index, part_type, text, data, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      params: [
        part.id,
        part.message_id,
        part.agent_id,
        part.part_index,
        part.part_type,
        part.text,
        part.data,
        part.created_at,
      ],
    })),
  ];
}

export async function replaceAgentMessage(
  db: SqlDriver,
  message: AgentMessageWithParts,
): Promise<void> {
  await db.transaction(replaceAgentMessageStatements(message));
}

export function insertAgentEventStatement(event: AgentEventRecord): SqlStatement {
  return {
    sql: `INSERT INTO agent_event (
            id, agent_id, workspace_id, provider, provider_id, turn_id,
            event_index, event_kind, payload, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    params: [
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
  };
}

export async function insertAgentEvent(db: SqlDriver, event: AgentEventRecord): Promise<void> {
  const statement = insertAgentEventStatement(event);
  await db.execute(statement.sql, statement.params);
}
