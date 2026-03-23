import { describe, expect, test } from "bun:test";
import type { AgentSessionRecord, WorkspaceTarget } from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import type {
  AgentEvent,
  CreateAgentOrchestratorDependencies,
  AgentStore,
  StartAgentSessionInput,
  AgentTurnRequest,
} from "./index";
import { createAgentOrchestrator } from "./index";

describe("agents package contracts", () => {
  type WorkerLauncher = CreateAgentOrchestratorDependencies["workerLaunchers"]["claude"];

  test("defines text and attachment turn inputs", () => {
    const input: AgentTurnRequest["input"] = [
      { type: "text", text: "Investigate the failing build." },
      { type: "attachment_ref", attachment_id: "attachment_1" },
    ];

    expect(input).toEqual([
      { type: "text", text: "Investigate the failing build." },
      { type: "attachment_ref", attachment_id: "attachment_1" },
    ]);
  });

  test("defines normalized agent events for first-party sessions", () => {
    const session: AgentSessionRecord = {
      id: "agent_session_1",
      workspace_id: "workspace_1",
      runtime_kind: "native",
      runtime_name: "codex",
      provider: "codex",
      provider_session_id: "thread_1",
      title: "Codex Session",
      status: "running",
      created_by: null,
      forked_from_session_id: null,
      last_message_at: null,
      created_at: "2026-03-21T00:00:00.000Z",
      updated_at: "2026-03-21T00:00:00.000Z",
      ended_at: null,
    };
    const event: AgentEvent = {
      kind: "agent.session.created",
      workspace_id: "workspace_1",
      session,
    };

    expect(event.kind).toBe("agent.session.created");
    expect(event.session.provider).toBe("codex");
  });

  test("defines provider-backed sessions behind a single provider seam without UI coupling", () => {
    const runtime = {} as WorkspaceRuntime;
    const input: StartAgentSessionInput = {
      workspace_id: "workspace_1",
      provider: "claude",
    };

    const implementation: WorkerLauncher = {
      async startWorker(session, workspace, boundRuntime) {
        expect(workspace.workspace_target).toBe("local");
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
      async connectWorker(session, workspace, boundRuntime) {
        expect(session.provider).toBe("claude");
        expect(workspace.workspace_target).toBe("local");
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
      async getSession(agent_session_id) {
        return sessions.get(agent_session_id) ?? null;
      },
      async listSessions(workspace_id) {
        return [...sessions.values()].filter((session) => session.workspace_id === workspace_id);
      },
      async getWorkspace(workspace_id) {
        return {
          workspace_id,
          workspace_target: "local" satisfies WorkspaceTarget,
          worktree_path: "/tmp/project",
        };
      },
    };
    const observed_events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator({
      workerLaunchers: {
        claude: implementation,
        codex: implementation,
      },
      resolveRuntime() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      random_id: () => "agent_session_1",
    });
    orchestrator.subscribe((event) => {
      observed_events.push(event);
    });

    const created_session_promise = orchestrator.startSession({
      provider: "claude",
      workspace_id: input.workspace_id,
    });

    return created_session_promise.then(async (agentSession) => {
      const created_session = agentSession.record;
      expect(typeof orchestrator.subscribe).toBe("function");
      expect(created_session.provider_session_id).toBe("claude-session-1");
      expect(created_session.title).toBe("");
      expect(observed_events).toHaveLength(1);
      expect(observed_events[0]?.kind).toBe("agent.session.created");

      await agentSession.sendTurn({
        turn_id: "turn_1",
        input: [{ type: "text", text: "Hello" }],
      });
    });
  });

  test("keeps runtime placement separate from provider selection", async () => {
    const seen_targets: WorkspaceTarget[] = [];
    const sessions = new Map<string, AgentSessionRecord>();
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agent_session_id) {
        return sessions.get(agent_session_id) ?? null;
      },
      async listSessions() {
        return [];
      },
      async getWorkspace(workspace_id) {
        return {
          workspace_id,
          workspace_target: "cloud",
        };
      },
    };
    const implementation: WorkerLauncher = {
      async startWorker(session) {
        return {
          session: {
            ...session,
            provider_session_id: "thread_1",
          },
          worker: {
            async sendTurn(_input) {
              seen_targets.push("cloud");
            },
            async cancelTurn() {},
            async resolveApproval() {},
          },
        };
      },
      async connectWorker(_session, workspace, boundRuntime) {
        seen_targets.push(workspace.workspace_target);
        expect(boundRuntime).toBe(runtime);
        return {
          async sendTurn() {},
          async cancelTurn() {},
          async resolveApproval() {},
        };
      },
    };
    const runtime = {} as WorkspaceRuntime;
    const orchestrator = createAgentOrchestrator({
      workerLaunchers: {
        claude: implementation,
        codex: implementation,
      },
      resolveRuntime() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      random_id: () => "agent_session_1",
    });

    const agentSession = await orchestrator.startSession({
      provider: "codex",
      workspace_id: "workspace_cloud",
    });

    await agentSession.sendTurn({
      turn_id: "turn_1",
      input: [{ type: "text", text: "Ship it." }],
    });

    expect(seen_targets).toEqual(["cloud"]);
  });

  test("moves sessions into waiting_input or waiting_approval while approvals are pending", async () => {
    const sessions = new Map<string, AgentSessionRecord>();
    const store: AgentStore = {
      async saveSession(session) {
        sessions.set(session.id, session);
        return session;
      },
      async getSession(agent_session_id) {
        return sessions.get(agent_session_id) ?? null;
      },
      async listSessions() {
        return [...sessions.values()];
      },
      async getWorkspace(workspace_id) {
        return {
          workspace_id,
          workspace_target: "local",
          worktree_path: "/tmp/project",
        };
      },
    };
    const runtime = {} as WorkspaceRuntime;
    const implementation: WorkerLauncher = {
      async startWorker(session, _context, _runtime, events) {
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
                  scope_key: "question:1",
                  session_id: session.id,
                  status: "pending",
                },
                session_id: session.id,
                workspace_id: session.workspace_id,
              });

              expect(sessions.get(session.id)?.status).toBe("waiting_input");

              await events.emit({
                kind: "agent.approval.resolved",
                resolution: {
                  approval_id: "approval_question",
                  decision: "approve_once",
                  response: { answers: {} },
                  session_id: session.id,
                },
                session_id: session.id,
                workspace_id: session.workspace_id,
              });

              expect(sessions.get(session.id)?.status).toBe("running");
            },
            async cancelTurn() {},
            async resolveApproval() {},
          },
        };
      },
      async connectWorker() {
        return {
          async sendTurn() {},
          async cancelTurn() {},
          async resolveApproval() {},
        };
      },
    };
    const observedEvents: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator({
      workerLaunchers: {
        claude: implementation,
        codex: implementation,
      },
      resolveRuntime() {
        return runtime;
      },
      store,
      now: () => "2026-03-21T00:00:00.000Z",
      random_id: () => "agent_session_1",
    });
    orchestrator.subscribe((event) => {
      observedEvents.push(event);
    });

    const session = await orchestrator.startSession({
      provider: "claude",
      workspace_id: "workspace_1",
    });

    await session.sendTurn({
      turn_id: "turn_approval",
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
          event.resolution.approval_id === "approval_question",
      ),
    ).toBeTrue();
  });
});
