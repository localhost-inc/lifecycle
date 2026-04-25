import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { createTursoDb } from "@lifecycle/db/turso";
import { insertRepository, insertWorkspaceStatement } from "@lifecycle/db/queries";
import {
  createWorkspaceAgent,
  getAgentSnapshot,
  resetAgentRuntimeRegistry,
  sendAgentTurn,
  waitForAgentIdle,
} from "./service";

const tempDirs: string[] = [];

afterEach(async () => {
  resetAgentRuntimeRegistry();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

async function prepareBridgeAgentSchema(db: Awaited<ReturnType<typeof createTursoDb>>) {
  await db.execute(`CREATE TABLE repository (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    manifest_path TEXT NOT NULL DEFAULT 'lifecycle.json',
    manifest_valid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE workspace (
    id TEXT PRIMARY KEY NOT NULL,
    repository_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL,
    name_origin TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT NOT NULL,
    source_ref_origin TEXT NOT NULL DEFAULT 'manual',
    git_sha TEXT,
    workspace_root TEXT,
    host TEXT NOT NULL DEFAULT 'local',
    checkout_type TEXT NOT NULL DEFAULT 'worktree',
    manifest_fingerprint TEXT,
    prepared_at TEXT,
    status TEXT NOT NULL DEFAULT 'provisioning',
    failure_reason TEXT,
    failed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE agent (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    provider_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN (
      'starting', 'idle', 'running', 'waiting_input', 'waiting_approval', 'completed', 'failed', 'cancelled'
    )),
    error_text TEXT,
    last_message_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE INDEX idx_agent_workspace ON agent(workspace_id, created_at DESC)`);
  await db.execute(`CREATE TABLE agent_message (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    text TEXT NOT NULL DEFAULT '',
    turn_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.execute(
    `CREATE INDEX idx_agent_message_agent ON agent_message(agent_id, created_at ASC)`,
  );
  await db.execute(`CREATE TABLE agent_message_part (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL REFERENCES agent_message(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    part_index INTEGER NOT NULL DEFAULT 0,
    part_type TEXT NOT NULL,
    text TEXT,
    data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(message_id, part_index)
  )`);
  await db.execute(
    `CREATE INDEX idx_agent_message_part_message ON agent_message_part(message_id, part_index ASC)`,
  );
  await db.execute(`CREATE TABLE agent_event (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    provider_id TEXT,
    turn_id TEXT,
    event_index INTEGER NOT NULL,
    event_kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(agent_id, event_index)
  )`);
  await db.execute(`CREATE INDEX idx_agent_event_agent ON agent_event(agent_id, event_index ASC)`);
}

function scriptedAssistantStream(text: string): StreamFn {
  return () => {
    const timestamp = Date.now();
    const partial: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      usage: {
        input: 12,
        output: 7,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 19,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp,
    };
    const finalMessage: AssistantMessage = {
      ...partial,
      content: [{ type: "text", text }],
    };

    return {
      async *[Symbol.asyncIterator]() {
        yield { type: "start", partial };
        yield {
          type: "text_delta",
          contentIndex: 0,
          delta: text,
          partial: finalMessage,
        };
        yield {
          type: "done",
          reason: "stop",
          message: finalMessage,
        };
      },
      async result() {
        return finalMessage;
      },
    } as unknown as ReturnType<StreamFn>;
  };
}

describe("bridge agent runtime", () => {
  test("persists prompt transcript and broadcasts projected events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-agent-"));
    tempDirs.push(dir);

    const db = await createTursoDb({
      clientName: "lifecycle-bridge-agent-test",
      path: join(dir, "bridge.db"),
    });
    await prepareBridgeAgentSchema(db);

    const repositoryId = await insertRepository(db, {
      path: "/tmp/lifecycle-agent",
      name: "Lifecycle Agent",
    });

    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      repository_id: repositoryId,
      name: "Main",
      slug: "main",
      checkout_type: "worktree",
      source_ref: "main",
      git_sha: null,
      workspace_root: "/tmp/lifecycle-agent/main",
      host: "local",
      manifest_fingerprint: null,
      prepared_at: now,
      status: "active",
      failure_reason: null,
      failed_at: null,
      created_at: now,
      updated_at: now,
      last_active_at: now,
    };
    const statement = insertWorkspaceStatement(workspace);
    await db.execute(statement.sql, statement.params);

    const socketEvents: Array<{ kind?: string; type?: string }> = [];
    const options = {
      broadcast: async (message: object) => {
        socketEvents.push(message as { kind?: string; type?: string });
      },
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: "test-key",
      },
      streamFn: scriptedAssistantStream("Bridge agent response."),
    };

    const agent = await createWorkspaceAgent(db, workspace.id, "claude", options);
    expect(agent.status).toBe("idle");

    const running = await sendAgentTurn(db, agent.id, "turn-1", "hello", options);
    expect(running.status).toBe("running");

    await waitForAgentIdle(agent.id);

    const snapshot = await getAgentSnapshot(db, agent.id, options);
    expect(snapshot.agent.status).toBe("idle");
    expect(snapshot.messages.map((message) => message.id)).toEqual([
      "turn-1:user",
      "turn-1:assistant",
    ]);
    expect(snapshot.messages[0]?.text).toBe("hello");
    expect(snapshot.messages[1]?.text).toBe("Bridge agent response.");
    expect(snapshot.messages[1]?.parts).toEqual([
      expect.objectContaining({
        id: "turn-1:assistant:part:1",
        message_id: "turn-1:assistant",
        part_index: 1,
        part_type: "text",
        text: "Bridge agent response.",
      }),
    ]);

    expect(socketEvents.map((event) => event.kind ?? event.type)).toEqual([
      "agent.updated",
      "agent.updated",
      "agent.turn.started",
      "agent.message.part.completed",
      "agent.message.part.delta",
      "agent.message.part.completed",
      "agent.turn.completed",
      "agent.updated",
    ]);
  });
});
