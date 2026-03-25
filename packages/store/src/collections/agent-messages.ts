import type {
  AgentMessageRecord,
  AgentMessagePartRecord,
  AgentMessageWithParts,
} from "@lifecycle/contracts";
import type { SqlDriver } from "../driver";

interface MessagePartRow {
  id: string;
  session_id: string;
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

export async function selectAgentMessagesBySession(
  driver: SqlDriver,
  sessionId: string,
): Promise<AgentMessageWithParts[]> {
  const rows = await driver.select<MessagePartRow>(
    `SELECT
       m.id,
       m.session_id,
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
     WHERE m.session_id = $1
     ORDER BY m.created_at ASC, m.id ASC, p.part_index ASC`,
    [sessionId],
  );

  const messagesMap = new Map<string, AgentMessageWithParts>();

  for (const row of rows) {
    let msg = messagesMap.get(row.id);
    if (!msg) {
      msg = {
        id: row.id,
        session_id: row.session_id,
        role: row.role as AgentMessageWithParts["role"],
        text: row.text,
        turn_id: row.turn_id,
        parts: [],
        created_at: row.created_at,
      };
      messagesMap.set(row.id, msg);
    }

    if (!row.part_id) {
      continue;
    }

    msg.parts.push({
      id: row.part_id,
      message_id: row.id,
      session_id: row.session_id,
      part_index: row.part_index ?? 0,
      part_type: row.part_type as AgentMessagePartRecord["part_type"],
      text: row.part_text,
      data: row.part_data,
      created_at: row.part_created_at ?? row.created_at,
    });
  }

  return [...messagesMap.values()];
}

export async function upsertAgentMessage(
  driver: SqlDriver,
  message: AgentMessageRecord,
): Promise<void> {
  await driver.execute(
    `INSERT INTO agent_message (id, session_id, role, text, turn_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       role = excluded.role,
       text = excluded.text,
       turn_id = excluded.turn_id`,
    [
      message.id,
      message.session_id,
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
    session_id: message.session_id,
    role: message.role,
    text: message.text,
    turn_id: message.turn_id,
    created_at: message.created_at,
  });

  if (message.parts.length === 0) {
    return;
  }

  // Batch all parts into a single multi-row INSERT to avoid N sequential
  // IPC round-trips during streaming (one per part per delta).
  const COLS_PER_ROW = 8;
  const placeholders: string[] = [];
  const params: unknown[] = [];
  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i]!;
    const offset = i * COLS_PER_ROW;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`,
    );
    params.push(
      part.id,
      part.message_id,
      part.session_id,
      part.part_index,
      part.part_type,
      part.text,
      part.data,
      part.created_at,
    );
  }

  await driver.execute(
    `INSERT INTO agent_message_part (
       id, message_id, session_id, part_index, part_type, text, data, created_at
     )
     VALUES ${placeholders.join(", ")}
     ON CONFLICT(id) DO UPDATE SET
       part_index = excluded.part_index,
       part_type = excluded.part_type,
       text = excluded.text,
       data = excluded.data`,
    params,
  );
}
