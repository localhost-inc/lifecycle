import { describe, expect, test } from "bun:test";
import type { AgentSessionRecord, WorkspaceHost, WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver, SqlStatement } from "@lifecycle/db";
import { createAgentSessionCollectionRegistry } from "@lifecycle/store";
import type { WorkspaceClient } from "@lifecycle/workspace/client";
import type { AgentEvent, StartAgentSessionInput, AgentTurnRequest, AgentClient } from "./index";
import { createAgentClient, createAgentClientRegistry } from "./index";
import type { AgentWorker } from "./worker";

describe("agents package contracts", () => {
  function createTestDriver(input?: {
    workspaces?: Array<{
      workspaceHost: WorkspaceHost;
      workspaceId: string;
      worktreePath?: string | null;
    }>;
  }): {
    driver: SqlDriver;
    sessions: Map<string, AgentSessionRecord>;
  } {
    const sessions = new Map<string, AgentSessionRecord>();
    const workspaces = new Map<string, WorkspaceRecord>();

    for (const workspace of input?.workspaces ?? [
      { workspaceHost: "local" as const, workspaceId: "workspace_1", worktreePath: "/tmp/project" },
    ]) {
      workspaces.set(workspace.workspaceId, {
        id: workspace.workspaceId,
        project_id: "project_1",
        name: workspace.workspaceId,
        checkout_type: "worktree",
        source_ref: "main",
        git_sha: null,
        worktree_path: workspace.worktreePath ?? null,
        host: workspace.workspaceHost,
        manifest_fingerprint: null,
        created_at: "2026-03-21T00:00:00.000Z",
        updated_at: "2026-03-21T00:00:00.000Z",
        last_active_at: "2026-03-21T00:00:00.000Z",
        prepared_at: null,
        status: "active",
        failure_reason: null,
        failed_at: null,
      });
    }

    function persistSessionStatement(statement: SqlStatement): void {
      if (!statement.sql.includes("INSERT INTO agent_session")) {
        return;
      }

      const params = statement.params ?? [];
      sessions.set(String(params[0]), {
        id: String(params[0]),
        workspace_id: String(params[1]),
        provider: String(params[2]) as AgentSessionRecord["provider"],
        provider_session_id: (params[3] as string | null) ?? null,
        title: String(params[4] ?? ""),
        status: String(params[5]) as AgentSessionRecord["status"],
        last_message_at: (params[6] as string | null) ?? null,
        created_at: String(params[7]),
        updated_at: String(params[8]),
      });
    }

    const driver: SqlDriver = {
      async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
        if (sql.includes("FROM workspace WHERE id = $1")) {
          const workspace = workspaces.get(String(params?.[0]));
          return workspace ? ([workspace] as T[]) : [];
        }

        if (sql.includes("FROM agent_session WHERE id = $1")) {
          const session = sessions.get(String(params?.[0]));
          return session ? ([session] as T[]) : [];
        }

        if (sql.includes("FROM agent_session WHERE workspace_id = $1")) {
          return [...sessions.values()]
            .filter((session) => session.workspace_id === String(params?.[0]))
            .sort((left, right) => left.created_at.localeCompare(right.created_at)) as T[];
        }

        return [];
      },
      async execute(): Promise<{ rowsAffected: number }> {
        return { rowsAffected: 1 };
      },
      async transaction(statements: readonly SqlStatement[]) {
        for (const statement of statements) {
          persistSessionStatement(statement);
        }
        return { rowsAffected: statements.map(() => 1) };
      },
    };

    return { driver, sessions };
  }

  function createHostClient(overrides: Partial<AgentWorker>): AgentWorker {
    return {
      async checkAuth() {
        return { state: "not_checked" };
      },
      async getModelCatalog() {
        throw new Error("getModelCatalog is not used in agent host tests.");
      },
      async login() {
        throw new Error("login is not used in agent host tests.");
      },
      async startSession(session) {
        return session;
      },
      async attachSession() {},
      async sendTurn() {},
      async cancelTurn() {},
      async resolveApproval() {},
      disconnectSession() {},
      ...overrides,
    };
  }

  test("defines text and attachment turn inputs", () => {
    const input: AgentTurnRequest["input"] = [
      { type: "text", text: "Investigate the failing build." },
      { type: "attachment_ref", attachmentId: "attachment_1" },
    ];

    expect(input).toEqual([
      { type: "text", text: "Investigate the failing build." },
      { type: "attachment_ref", attachmentId: "attachment_1" },
    ]);
  });

  test("defines normalized agent events for first-party sessions", () => {
    const session: AgentSessionRecord = {
      id: "agent_session_1",
      workspace_id: "workspace_1",
      provider: "codex",
      provider_session_id: "thread_1",
      title: "Codex Session",
      status: "running",
      last_message_at: null,
      created_at: "2026-03-21T00:00:00.000Z",
      updated_at: "2026-03-21T00:00:00.000Z",
    };
    const event: AgentEvent = {
      kind: "agent.session.created",
      workspaceId: "workspace_1",
      session,
    };

    expect(event.kind).toBe("agent.session.created");
    expect(event.session.provider).toBe("codex");
  });

  test("maps worker raw provider events onto agent provider events", async () => {
    const runtime = {} as WorkspaceClient;
    const { driver } = createTestDriver();
    const observedEvents: AgentEvent[] = [];
    const implementation = createHostClient({
      async sendTurn(_session, _workspace, _boundRuntime, callbacks, input) {
        await callbacks.onEvent({
          kind: "provider.raw_event",
          eventType: "codex.notification.turn/started",
          payload: {
            jsonrpc: "2.0",
            method: "turn/started",
            params: { turn: { id: "provider_turn_1" } },
          },
          turnId: input.turnId,
        });
        await callbacks.onEvent({
          kind: "agent.turn.completed",
          turnId: input.turnId,
        });
      },
    });
    const client = createAgentClient({
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      agentWorker: implementation,
      driver,
      workspaceClient: runtime,
      workspaceHost: "local",
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const session = await client.startSession({
      provider: "codex",
      workspaceId: "workspace_1",
    });
    await client.sendTurn(session.id, {
      turnId: "turn_1",
      input: [{ type: "text", text: "Hello" }],
    });

    expect(observedEvents).toContainEqual({
      kind: "agent.provider.event",
      workspaceId: "workspace_1",
      sessionId: "agent_session_1",
      turnId: "turn_1",
      eventType: "codex.notification.turn/started",
      payload: {
        jsonrpc: "2.0",
        method: "turn/started",
        params: { turn: { id: "provider_turn_1" } },
      },
    });
  });

  test("defines provider-backed sessions behind a single provider seam without UI coupling", async () => {
    const runtime = {} as WorkspaceClient;
    const input: StartAgentSessionInput = {
      workspaceId: "workspace_1",
      provider: "claude",
    };

    const implementation = createHostClient({
      async startSession(session, workspace, boundRuntime) {
        expect(workspace.workspaceHost).toBe("local");
        expect(boundRuntime).toBe(runtime);
        return {
          ...session,
          provider_session_id: "claude-session-1",
        };
      },
      async sendTurn(session, workspace, boundRuntime) {
        expect(session.provider).toBe("claude");
        expect(workspace.workspaceHost).toBe("local");
        expect(boundRuntime).toBe(runtime);
      },
    });

    const { driver } = createTestDriver();
    const observedEvents: AgentEvent[] = [];
    const client = createAgentClient({
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      agentWorker: implementation,
      driver,
      workspaceClient: runtime,
      workspaceHost: "local",
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const createdSession = await client.startSession({
      provider: "claude",
      workspaceId: input.workspaceId,
    });

    expect(typeof client.subscribe).toBe("function");
    expect(createdSession.provider_session_id).toBe("claude-session-1");
    expect(createdSession.title).toBe("");
    expect(observedEvents).toHaveLength(2);
    expect(observedEvents[0]?.kind).toBe("agent.session.created");
    expect(observedEvents[1]?.kind).toBe("agent.session.updated");

    await client.sendTurn(createdSession.id, {
      turnId: "turn_1",
      input: [{ type: "text", text: "Hello" }],
    });
  });

  test("creates a starting draft session before worker bootstrap", async () => {
    const runtime = {} as WorkspaceClient;
    const { driver, sessions } = createTestDriver();
    let workerStarted = false;
    const implementation = createHostClient({
      async startSession() {
        workerStarted = true;
        throw new Error("runtime start should not run during draft creation");
      },
    });
    const observedEvents: AgentEvent[] = [];
    const client = createAgentClient({
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      agentWorker: implementation,
      driver,
      workspaceClient: runtime,
      workspaceHost: "local",
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const draftSession = await client.createDraftSession({
      provider: "claude",
      workspaceId: "workspace_1",
    });

    expect(workerStarted).toBeFalse();
    expect(draftSession.status).toBe("starting");
    expect(sessions.get(draftSession.id)?.status).toBe("starting");
    expect(observedEvents).toEqual([
      {
        kind: "agent.session.created",
        workspaceId: "workspace_1",
        session: draftSession,
      },
    ]);
  });

  test("keeps runtime placement separate from provider selection", async () => {
    const seenTargets: WorkspaceHost[] = [];
    const { driver } = createTestDriver({
      workspaces: [{ workspaceHost: "cloud", workspaceId: "workspace_cloud" }],
    });
    const implementation = createHostClient({
      async startSession(session) {
        return {
          ...session,
          provider_session_id: "thread_1",
        };
      },
      async sendTurn(_session, workspace, boundRuntime) {
        seenTargets.push(workspace.workspaceHost);
        expect(boundRuntime).toBe(runtime);
      },
    });
    const runtime = {} as WorkspaceClient;
    const client = createAgentClient({
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      agentWorker: implementation,
      driver,
      workspaceClient: runtime,
      workspaceHost: "cloud",
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });

    const session = await client.startSession({
      provider: "codex",
      workspaceId: "workspace_cloud",
    });

    await client.sendTurn(session.id, {
      turnId: "turn_1",
      input: [{ type: "text", text: "Ship it." }],
    });

    expect(seenTargets).toEqual(["cloud"]);
  });

  test("resolves agent clients explicitly by host without fallback aliasing", () => {
    const localClient = { workspaceHost: "local" } as AgentClient;
    const dockerClient = { workspaceHost: "docker" } as AgentClient;
    const registry = createAgentClientRegistry({
      docker: dockerClient,
      local: localClient,
    });

    expect(registry.resolve("local")).toBe(localClient);
    expect(registry.resolve("docker")).toBe(dockerClient);
    expect(() => registry.resolve("cloud")).toThrow(
      'No AgentClient is registered for workspace host "cloud".',
    );
  });

  test("moves sessions into waiting_input or waiting_approval while approvals are pending", async () => {
    const { driver, sessions } = createTestDriver();
    const runtime = {} as WorkspaceClient;
    const implementation = createHostClient({
      async startSession(session, _context, _runtime, callbacks) {
        void callbacks;
        return { ...session, provider_session_id: "session_1" };
      },
      async sendTurn(session, _context, _runtime, callbacks) {
        await callbacks.onEvent({
          kind: "agent.approval.requested",
          approval: {
            id: "approval_question",
            kind: "question",
            message: "Need input",
            metadata: { questions: [] },
            scopeKey: "question:1",
            status: "pending",
          },
          turnId: "turn_approval",
        });

        expect(sessions.get(session.id)?.status).toBe("waiting_input");

        await callbacks.onEvent({
          kind: "agent.approval.resolved",
          resolution: {
            approvalId: "approval_question",
            decision: "approve_once",
            response: { answers: {} },
          },
          turnId: "turn_approval",
        });

        expect(sessions.get(session.id)?.status).toBe("running");
      },
    });
    const observedEvents: AgentEvent[] = [];
    const client = createAgentClient({
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      agentWorker: implementation,
      driver,
      workspaceClient: runtime,
      workspaceHost: "local",
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const session = await client.startSession({
      provider: "claude",
      workspaceId: "workspace_1",
    });

    await client.sendTurn(session.id, {
      turnId: "turn_approval",
      input: [{ type: "text", text: "Need approval" }],
    });

    expect(
      observedEvents.some(
        (event) =>
          event.kind === "agent.approval.requested" && event.approval.id === "approval_question",
      ),
    ).toBeTrue();
    expect(
      observedEvents.some(
        (event) =>
          event.kind === "agent.approval.resolved" &&
          event.resolution.approvalId === "approval_question",
      ),
    ).toBeTrue();
  });

  test("keeps the draft session and marks it failed when bootstrap fails", async () => {
    const { driver, sessions } = createTestDriver();
    const runtime = {} as WorkspaceClient;
    const implementation = createHostClient({
      async startSession() {
        throw new Error("Claude login failed.");
      },
    });
    const observedEvents: AgentEvent[] = [];
    const client = createAgentClient({
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      agentWorker: implementation,
      driver,
      workspaceClient: runtime,
      workspaceHost: "local",
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const draftSession = await client.createDraftSession({
      provider: "claude",
      workspaceId: "workspace_1",
    });

    await expect(client.bootstrapSession(draftSession.id)).rejects.toThrow("Claude login failed.");

    expect(sessions.get(draftSession.id)?.status).toBe("failed");
    expect(observedEvents.map((event) => event.kind)).toEqual([
      "agent.session.created",
      "agent.session.updated",
      "agent.status.updated",
    ]);
  });

  test("reattaches an existing persisted session without sending a new turn", async () => {
    const { driver, sessions } = createTestDriver();
    sessions.set("agent_session_1", {
      id: "agent_session_1",
      workspace_id: "workspace_1",
      provider: "codex",
      provider_session_id: "thread_1",
      title: "",
      status: "running",
      last_message_at: null,
      created_at: "2026-03-21T00:00:00.000Z",
      updated_at: "2026-03-21T00:00:00.000Z",
    });
    const runtime = {} as WorkspaceClient;
    let connected = false;
    const implementation = createHostClient({
      async startSession() {
        throw new Error("start should not be called");
      },
      async attachSession(session) {
        connected = true;
        expect(session.provider_session_id).toBe("thread_1");
      },
    });
    const client = createAgentClient({
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      agentWorker: implementation,
      driver,
      workspaceClient: runtime,
      workspaceHost: "local",
    });

    await client.attachSession("agent_session_1");

    expect(connected).toBeTrue();
  });

  test("reconnects and retries when a cached worker handle goes stale", async () => {
    const { driver } = createTestDriver();

    const runtime = {} as WorkspaceClient;
    let disconnectCount = 0;
    let sendCount = 0;
    const implementation = createHostClient({
      async startSession(session) {
        return {
          ...session,
          provider_session_id: "claude-session-1",
        };
      },
      async sendTurn() {
        sendCount += 1;
        if (sendCount === 1) {
          throw new Error("stale connection");
        }
      },
      disconnectSession() {
        disconnectCount += 1;
      },
    });

    const observedEvents: AgentEvent[] = [];
    const client = createAgentClient({
      agentSessionRegistry: createAgentSessionCollectionRegistry(),
      agentWorker: implementation,
      driver,
      workspaceClient: runtime,
      workspaceHost: "local",
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const session = await client.startSession({
      provider: "claude",
      workspaceId: "workspace_1",
    });

    await client.sendTurn(session.id, {
      turnId: "turn_retry",
      input: [{ type: "text", text: "Retry after reconnect" }],
    });

    expect(disconnectCount).toBe(1);
    expect(sendCount).toBe(2);
    expect(
      observedEvents
        .filter((event) => event.kind === "agent.status.updated")
        .map((event) => ({
          detail: event.detail ?? null,
          status: event.status,
        })),
    ).toEqual([
      {
        detail: "Reconnecting to agent runtime...",
        status: "reconnecting",
      },
      {
        detail: null,
        status: "",
      },
    ]);
  });
});
