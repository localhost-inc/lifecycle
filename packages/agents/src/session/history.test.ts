import { describe, expect, test } from "bun:test";
import type { AgentSessionRecord } from "@lifecycle/contracts";
import type { SqlDriver, SqlStatement } from "@lifecycle/db";
import {
  createAgentMessageCollectionRegistry,
  createAgentSessionCollectionRegistry,
} from "@lifecycle/store";
import { createAgentSessionHistoryObserver } from "./history";

describe("agent session history", () => {
  test("persists raw provider events with the raw event type", async () => {
    const insertedEvents: Array<{ eventKind: string; payload: string; turnId: string | null }> = [];

    const driver: SqlDriver = {
      async select<T>(sql: string): Promise<T[]> {
        if (sql.includes("SELECT COALESCE(MAX(event_index), 0) + 1 AS next_index")) {
          return [{ next_index: insertedEvents.length + 1 }] as T[];
        }
        if (sql.includes("SELECT COUNT(*) AS cnt FROM agent_message_part")) {
          return [{ cnt: 0 }] as T[];
        }
        return [];
      },
      async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
        if (sql.includes("INSERT INTO agent_event")) {
          insertedEvents.push({
            eventKind: String(params?.[7]),
            payload: String(params?.[8]),
            turnId: (params?.[5] as string | null) ?? null,
          });
        }
        return { rowsAffected: 1 };
      },
      async transaction(statements: readonly SqlStatement[]) {
        return { rowsAffected: statements.map(() => 1) };
      },
    };

    const observer = createAgentSessionHistoryObserver({
      agentMessageRegistry: createAgentMessageCollectionRegistry(),
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      driver,
      now: () => "2026-03-29T00:00:00.000Z",
      stateKey: "history-test:raw-provider-event",
    });

    const session: AgentSessionRecord = {
      id: "session_1",
      workspace_id: "workspace_1",
      provider: "codex",
      provider_session_id: "thread_1",
      title: "",
      status: "idle",
      last_message_at: null,
      created_at: "2026-03-29T00:00:00.000Z",
      updated_at: "2026-03-29T00:00:00.000Z",
    };

    await observer({
      kind: "agent.session.created",
      workspaceId: "workspace_1",
      session,
    });
    await observer({
      kind: "agent.provider.event",
      workspaceId: "workspace_1",
      sessionId: "session_1",
      turnId: "turn_1",
      eventType: "codex.notification.turn/diff/updated",
      payload: {
        jsonrpc: "2.0",
        method: "turn/diff/updated",
        params: {
          diff: "diff --git a/src/app.ts b/src/app.ts",
          turnId: "provider_turn_1",
        },
      },
    });

    expect(insertedEvents).toEqual([
      expect.objectContaining({
        eventKind: "agent.session.created",
        turnId: null,
      }),
      expect.objectContaining({
        eventKind: "codex.notification.turn/diff/updated",
        turnId: "turn_1",
      }),
    ]);
    expect(JSON.parse(insertedEvents[1]!.payload)).toMatchObject({
      eventType: "codex.notification.turn/diff/updated",
      kind: "agent.provider.event",
    });
  });
});
