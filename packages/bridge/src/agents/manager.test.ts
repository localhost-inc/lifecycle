import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { insertRepository, insertWorkspaceStatement } from "@lifecycle/db/queries";
import { createTursoDb } from "@lifecycle/db/turso";
import type { AgentCallbacks, AgentHandle } from "@lifecycle/agents/internal/handle";
import type { AgentContext } from "@lifecycle/agents";
import { createWorkspaceClientRegistry } from "@lifecycle/workspace";

import { createAgentManager } from "./manager";
import { upsertAgentMessageWithParts, upsertAgent } from "./persistence";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTestDb() {
  const dir = await mkdtemp(join(tmpdir(), "lifecycle-bridge-agent-manager-"));
  tempDirs.push(dir);

  const db = await createTursoDb({
    path: join(dir, "bridge.db"),
    clientName: "lifecycle-bridge-agent-manager-test",
  });
  await applyDbMigrations(db);
  return db;
}

async function insertWorkspace(
  db: Awaited<ReturnType<typeof createTestDb>>,
  input: { host: WorkspaceRecord["host"]; id: string; path: string },
) {
  const repositoryId = await insertRepository(db, {
    name: `${input.id}-repo`,
    path: input.path,
  });
  const now = "2026-04-04T00:00:00.000Z";
  const workspace: WorkspaceRecord = {
    id: input.id,
    repository_id: repositoryId,
    name: input.id,
    slug: input.id,
    checkout_type: "worktree",
    source_ref: "main",
    git_sha: null,
    workspace_root: input.path,
    host: input.host,
    manifest_fingerprint: null,
    prepared_at: null,
    status: "active",
    failure_reason: null,
    failed_at: null,
    created_at: now,
    updated_at: now,
    last_active_at: now,
  };
  const statement = insertWorkspaceStatement(workspace);
  await db.execute(statement.sql, statement.params);
  return workspace;
}

function createFakeAgentHandle() {
  const sendTurn = mock(async () => {});
  const cancelTurn = mock(async () => {});
  const resolveApproval = mock(async () => {});
  const handle: AgentHandle = { sendTurn, cancelTurn, resolveApproval, isHealthy: () => true };
  return { handle, sendTurn, cancelTurn, resolveApproval };
}

describe("AgentManager", () => {
  test("starts an agent and transitions to idle", async () => {
    const db = await createTestDb();
    await insertWorkspace(db, {
      host: "docker",
      id: "workspace-docker",
      path: "/tmp/workspace-docker",
    });

    const fake = createFakeAgentHandle();
    const createAgentHandle = mock((_s: AgentRecord, _c: AgentContext, _cb: AgentCallbacks) => fake.handle);
    const manager = createAgentManager({
      baseUrl: "http://127.0.0.1:4444",
      createAgentHandle,
      driver: db,
      now: () => "2026-04-04T00:00:00.000Z",
      randomId: () => "session-workspace-docker",
      workspaceRegistry: createWorkspaceClientRegistry({
        docker: {} as never,
        local: {} as never,
      }),
    });

    const agent = await manager.startAgent({
      provider: "codex",
      workspaceId: "workspace-docker",
    });

    expect(agent).toMatchObject({
      id: "session-workspace-docker",
      workspace_id: "workspace-docker",
      provider: "codex",
      status: "starting",
    });
    expect(createAgentHandle).toHaveBeenCalledTimes(1);
    expect(createAgentHandle.mock.calls[0]?.[1]).toMatchObject({
      workspaceHost: "docker",
      workspaceId: "workspace-docker",
      workspaceRoot: "/tmp/workspace-docker",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const persisted = await manager.inspectAgent("session-workspace-docker");
    expect(persisted.agent.status).toBe("idle");

    await db.close();
  });

  test("inspects persisted agents and transcript messages", async () => {
    const db = await createTestDb();
    await insertWorkspace(db, {
      host: "local",
      id: "workspace-local",
      path: "/tmp/workspace-local",
    });

    await upsertAgent(db, {
      id: "session-1",
      workspace_id: "workspace-local",
      provider: "codex",
      provider_id: "thread-1",
      title: "Codex Session",
      status: "running",
      last_message_at: "2026-04-04T00:00:01.000Z",
      created_at: "2026-04-04T00:00:00.000Z",
      updated_at: "2026-04-04T00:00:01.000Z",
    });
    await upsertAgentMessageWithParts(db, {
      id: "message-1",
      agent_id: "session-1",
      role: "assistant",
      text: "hello",
      turn_id: "turn-1",
      created_at: "2026-04-04T00:00:02.000Z",
      parts: [
        {
          id: "message-1:part-1",
          message_id: "message-1",
          agent_id: "session-1",
          part_index: 0,
          part_type: "text",
          text: "hello",
          data: null,
          created_at: "2026-04-04T00:00:02.000Z",
        },
      ],
    });

    const fake = createFakeAgentHandle();
    const manager = createAgentManager({
      baseUrl: "http://127.0.0.1:4444",
      createAgentHandle: () => fake.handle,
      driver: db,
      workspaceRegistry: createWorkspaceClientRegistry({ local: {} as never }),
    });

    const result = await manager.inspectAgent("session-1");

    expect(result.agent.title).toBe("Codex Session");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.parts[0]?.text).toBe("hello");

    await db.close();
  });

  test("reattaches active agents during initialization", async () => {
    const db = await createTestDb();
    await insertWorkspace(db, {
      host: "local",
      id: "workspace-local",
      path: "/tmp/workspace-local",
    });
    await upsertAgent(db, {
      id: "session-active",
      workspace_id: "workspace-local",
      provider: "claude",
      provider_id: null,
      title: "",
      status: "running",
      last_message_at: null,
      created_at: "2026-04-04T00:00:00.000Z",
      updated_at: "2026-04-04T00:00:00.000Z",
    });
    await upsertAgent(db, {
      id: "session-done",
      workspace_id: "workspace-local",
      provider: "claude",
      provider_id: null,
      title: "",
      status: "completed",
      last_message_at: null,
      created_at: "2026-04-04T00:00:00.000Z",
      updated_at: "2026-04-04T00:00:00.000Z",
    });

    const fake = createFakeAgentHandle();
    const createAgentHandle = mock((_s: AgentRecord, _c: AgentContext, _cb: AgentCallbacks) => fake.handle);
    const manager = createAgentManager({
      baseUrl: "http://127.0.0.1:4444",
      createAgentHandle,
      driver: db,
      workspaceRegistry: createWorkspaceClientRegistry({ local: {} as never }),
    });

    await manager.initialize();

    expect(createAgentHandle).toHaveBeenCalledTimes(1);
    expect(createAgentHandle.mock.calls[0]?.[0]).toMatchObject({ id: "session-active" });

    await db.close();
  });

  test("routes turn control through the agent handle and persists user input messages", async () => {
    const db = await createTestDb();
    await insertWorkspace(db, {
      host: "local",
      id: "workspace-local",
      path: "/tmp/workspace-local",
    });
    await upsertAgent(db, {
      id: "session-1",
      workspace_id: "workspace-local",
      provider: "codex",
      provider_id: null,
      title: "",
      status: "running",
      last_message_at: null,
      created_at: "2026-04-04T00:00:00.000Z",
      updated_at: "2026-04-04T00:00:00.000Z",
    });

    const fake = createFakeAgentHandle();
    const manager = createAgentManager({
      baseUrl: "http://127.0.0.1:4444",
      createAgentHandle: () => fake.handle,
      driver: db,
      now: () => "2026-04-04T00:00:01.000Z",
      workspaceRegistry: createWorkspaceClientRegistry({ local: {} as never }),
    });

    await manager.sendTurn("session-1", {
      turnId: "turn-1",
      input: [{ type: "text", text: "Hello" }],
    });
    await manager.cancelTurn("session-1", { turnId: "turn-1" });
    await manager.resolveApproval("session-1", {
      approvalId: "approval-1",
      decision: "approve_once",
    });

    expect(fake.sendTurn).toHaveBeenCalledTimes(1);
    expect(fake.cancelTurn).toHaveBeenCalledTimes(1);
    expect(fake.resolveApproval).toHaveBeenCalledTimes(1);

    const result = await manager.inspectAgent("session-1");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: "turn-1:user",
      role: "user",
      text: "Hello",
    });

    await db.close();
  });
});
