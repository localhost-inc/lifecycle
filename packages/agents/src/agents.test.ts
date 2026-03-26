import { describe, expect, test } from "bun:test";
import type { AgentSessionRecord, WorkspaceHost } from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace";
import type {
  AgentEvent,
  CreateAgentOrchestratorDependencies,
  AgentStore,
  StartAgentSessionInput,
  AgentTurnRequest,
} from "./index";
import { createAgentOrchestrator } from "./index";

describe("agents package contracts", () => {
  type Worker = CreateAgentOrchestratorDependencies["worker"];

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

  test("defines provider-backed sessions behind a single provider seam without UI coupling", async () => {
    const runtime = {} as WorkspaceClient;
    const input: StartAgentSessionInput = {
      workspaceId: "workspace_1",
      provider: "claude",
    };

    const implementation: Worker = {
      async start(session, workspace, boundRuntime) {
        expect(workspace.workspaceHost).toBe("local");
        expect(boundRuntime).toBe(runtime);
        return {
          session: {
            ...session,
            provider_session_id: "claude-session-1",
          },
          worker: {
            async sendTurn(_input) {},
            async cancelTurn(_input) {},
            async resolveApproval(_input) {},
          },
        };
      },
      async connect(session, workspace, boundRuntime) {
        expect(session.provider).toBe("claude");
        expect(workspace.workspaceHost).toBe("local");
        expect(boundRuntime).toBe(runtime);
        return {
          async sendTurn(_input) {},
          async cancelTurn(_input) {},
          async resolveApproval(_input) {},
        };
      },
    };

    const sessions = new Map<string, AgentSessionRecord>();
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agentSessionId) {
        return sessions.get(agentSessionId) ?? null;
      },
      async listSessions(workspaceId) {
        return [...sessions.values()].filter((session) => session.workspace_id === workspaceId);
      },
      async getWorkspace(workspaceId) {
        return {
          workspaceId,
          workspaceHost: "local" satisfies WorkspaceHost,
          worktreePath: "/tmp/project",
        };
      },
    };
    const observedEvents: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator({
      worker: implementation,
      resolveClient() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    orchestrator.subscribe((event) => {
      observedEvents.push(event);
    });

    const createdSession = await orchestrator.startSession({
      provider: "claude",
      workspaceId: input.workspaceId,
    });

    expect(typeof orchestrator.subscribe).toBe("function");
    expect(createdSession.provider_session_id).toBe("claude-session-1");
    expect(createdSession.title).toBe("");
    expect(observedEvents).toHaveLength(2);
    expect(observedEvents[0]?.kind).toBe("agent.session.created");
    expect(observedEvents[1]?.kind).toBe("agent.session.updated");

    await orchestrator.sendTurn(createdSession.id, {
      turnId: "turn_1",
      input: [{ type: "text", text: "Hello" }],
    });
  });

  test("creates a starting draft session before worker bootstrap", async () => {
    const runtime = {} as WorkspaceClient;
    const sessions = new Map<string, AgentSessionRecord>();
    let workerStarted = false;
    const implementation: Worker = {
      async start() {
        workerStarted = true;
        throw new Error("worker start should not run during draft creation");
      },
      async connect() {
        return {
          async sendTurn() {},
          async cancelTurn() {},
          async resolveApproval() {},
        };
      },
    };
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agentSessionId) {
        return sessions.get(agentSessionId) ?? null;
      },
      async listSessions(workspaceId) {
        return [...sessions.values()].filter((session) => session.workspace_id === workspaceId);
      },
      async getWorkspace(workspaceId) {
        return {
          workspaceId,
          workspaceHost: "local" satisfies WorkspaceHost,
          worktreePath: "/tmp/project",
        };
      },
    };
    const observedEvents: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator({
      worker: implementation,
      resolveClient() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    orchestrator.subscribe((event) => {
      observedEvents.push(event);
    });

    const draftSession = await orchestrator.createDraftSession({
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
    const sessions = new Map<string, AgentSessionRecord>();
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agentSessionId) {
        return sessions.get(agentSessionId) ?? null;
      },
      async listSessions() {
        return [];
      },
      async getWorkspace(workspaceId) {
        return {
          workspaceId,
          workspaceHost: "cloud",
        };
      },
    };
    const implementation: Worker = {
      async start(session) {
        return {
          session: {
            ...session,
            provider_session_id: "thread_1",
          },
          worker: {
            async sendTurn(_input) {
              seenTargets.push("cloud");
            },
            async cancelTurn() {},
            async resolveApproval() {},
          },
        };
      },
      async connect(_session, workspace, boundRuntime) {
        seenTargets.push(workspace.workspaceHost);
        expect(boundRuntime).toBe(runtime);
        return {
          async sendTurn() {},
          async cancelTurn() {},
          async resolveApproval() {},
        };
      },
    };
    const runtime = {} as WorkspaceClient;
    const orchestrator = createAgentOrchestrator({
      worker: implementation,
      resolveClient() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });

    const session = await orchestrator.startSession({
      provider: "codex",
      workspaceId: "workspace_cloud",
    });

    await orchestrator.sendTurn(session.id, {
      turnId: "turn_1",
      input: [{ type: "text", text: "Ship it." }],
    });

    expect(seenTargets).toEqual(["cloud"]);
  });

  test("moves sessions into waiting_input or waiting_approval while approvals are pending", async () => {
    const sessions = new Map<string, AgentSessionRecord>();
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agentSessionId) {
        return sessions.get(agentSessionId) ?? null;
      },
      async listSessions() {
        return [...sessions.values()];
      },
      async getWorkspace(workspaceId) {
        return {
          workspaceId,
          workspaceHost: "local",
          worktreePath: "/tmp/project",
        };
      },
    };
    const runtime = {} as WorkspaceClient;
    const implementation: Worker = {
      async start(session, _context, _runtime, events) {
        return {
          session: { ...session, provider_session_id: "session_1" },
          worker: {
            async sendTurn() {
              await events.emit({
                kind: "agent.approval.requested",
                approval: {
                  id: "approval_question",
                  kind: "question",
                  message: "Need input",
                  metadata: { questions: [] },
                  scopeKey: "question:1",
                  sessionId: session.id,
                  status: "pending",
                },
                sessionId: session.id,
                workspaceId: session.workspace_id,
              });

              expect(sessions.get(session.id)?.status).toBe("waiting_input");

              await events.emit({
                kind: "agent.approval.resolved",
                resolution: {
                  approvalId: "approval_question",
                  decision: "approve_once",
                  response: { answers: {} },
                  sessionId: session.id,
                },
                sessionId: session.id,
                workspaceId: session.workspace_id,
              });

              expect(sessions.get(session.id)?.status).toBe("running");
            },
            async cancelTurn() {},
            async resolveApproval() {},
          },
        };
      },
      async connect() {
        return {
          async sendTurn() {},
          async cancelTurn() {},
          async resolveApproval() {},
        };
      },
    };
    const observedEvents: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator({
      worker: implementation,
      resolveClient() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    orchestrator.subscribe((event) => {
      observedEvents.push(event);
    });

    const session = await orchestrator.startSession({
      provider: "claude",
      workspaceId: "workspace_1",
    });

    await orchestrator.sendTurn(session.id, {
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
    const sessions = new Map<string, AgentSessionRecord>();
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agentSessionId) {
        return sessions.get(agentSessionId) ?? null;
      },
      async listSessions() {
        return [...sessions.values()];
      },
      async getWorkspace(workspaceId) {
        return {
          workspaceId,
          workspaceHost: "local",
          worktreePath: "/tmp/project",
        };
      },
    };
    const runtime = {} as WorkspaceClient;
    const implementation: Worker = {
      async start() {
        throw new Error("Claude login failed.");
      },
      async connect() {
        return {
          async sendTurn() {},
          async cancelTurn() {},
          async resolveApproval() {},
        };
      },
    };
    const observedEvents: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator({
      worker: implementation,
      resolveClient() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    orchestrator.subscribe((event) => {
      observedEvents.push(event);
    });

    const draftSession = await orchestrator.createDraftSession({
      provider: "claude",
      workspaceId: "workspace_1",
    });

    await expect(orchestrator.bootstrapSession(draftSession.id)).rejects.toThrow(
      "Claude login failed.",
    );

    expect(sessions.get(draftSession.id)?.status).toBe("failed");
    expect(observedEvents.map((event) => event.kind)).toEqual([
      "agent.session.created",
      "agent.session.updated",
      "agent.status.updated",
    ]);
  });

  test("reattaches an existing persisted session without sending a new turn", async () => {
    const sessions = new Map<string, AgentSessionRecord>([
      [
        "agent_session_1",
        {
          id: "agent_session_1",
          workspace_id: "workspace_1",
          provider: "codex",
          provider_session_id: "thread_1",
          title: "",
          status: "running",
          last_message_at: null,
          created_at: "2026-03-21T00:00:00.000Z",
          updated_at: "2026-03-21T00:00:00.000Z",
        },
      ],
    ]);
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agentSessionId) {
        return sessions.get(agentSessionId) ?? null;
      },
      async listSessions() {
        return [...sessions.values()];
      },
      async getWorkspace(workspaceId) {
        return {
          workspaceId,
          workspaceHost: "local",
          worktreePath: "/tmp/project",
        };
      },
    };
    const runtime = {} as WorkspaceClient;
    let connected = false;
    const implementation: Worker = {
      async start() {
        throw new Error("start should not be called");
      },
      async connect(session) {
        connected = true;
        expect(session.provider_session_id).toBe("thread_1");
        return {
          async sendTurn() {},
          async cancelTurn() {},
          async resolveApproval() {},
        };
      },
    };
    const orchestrator = createAgentOrchestrator({
      worker: implementation,
      resolveClient() {
        return runtime;
      },
      store,
    });

    await orchestrator.attachSession("agent_session_1");

    expect(connected).toBeTrue();
  });

  test("reconnects and retries when a cached worker handle goes stale", async () => {
    const sessions = new Map<string, AgentSessionRecord>();
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agentSessionId) {
        return sessions.get(agentSessionId) ?? null;
      },
      async listSessions(workspaceId) {
        return [...sessions.values()].filter((session) => session.workspace_id === workspaceId);
      },
      async getWorkspace(workspaceId) {
        return {
          workspaceId,
          workspaceHost: "local",
          worktreePath: "/tmp/project",
        };
      },
    };

    const runtime = {} as WorkspaceClient;
    let connectCount = 0;
    let sendCount = 0;
    const implementation: Worker = {
      async start(session) {
        return {
          session: {
            ...session,
            provider_session_id: "claude-session-1",
          },
          worker: {
            async sendTurn() {
              sendCount += 1;
              if (sendCount === 1) {
                throw new Error("stale connection");
              }
            },
            async cancelTurn() {},
            async resolveApproval() {},
          },
        };
      },
      async connect() {
        connectCount += 1;
        return {
          async sendTurn() {
            sendCount += 1;
            if (sendCount === 1) {
              throw new Error("stale connection");
            }
          },
          async cancelTurn() {},
          async resolveApproval() {},
        };
      },
    };

    const observedEvents: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator({
      worker: implementation,
      resolveClient() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      randomId: () => "agent_session_1",
    });
    orchestrator.subscribe((event) => {
      observedEvents.push(event);
    });

    const session = await orchestrator.startSession({
      provider: "claude",
      workspaceId: "workspace_1",
    });

    await orchestrator.sendTurn(session.id, {
      turnId: "turn_retry",
      input: [{ type: "text", text: "Retry after reconnect" }],
    });

    expect(connectCount).toBe(1);
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
        detail: "Reconnecting to agent worker...",
        status: "reconnecting",
      },
      {
        detail: null,
        status: "",
      },
    ]);
  });
});
