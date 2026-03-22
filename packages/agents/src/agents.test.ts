import { describe, expect, test } from "bun:test";
import type { AgentSessionRecord, WorkspaceTarget } from "@lifecycle/contracts";
import type {
  AgentBackendAdapter,
  AgentBackendSessionCreateInput,
  AgentEvent,
  AgentOrchestrator,
  AgentSessionStore,
  AgentTurnRequest,
} from "./index";
import { DefaultAgentOrchestrator } from "./index";

describe("agents package contracts", () => {
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
      runtime_kind: "adapter",
      runtime_name: "codex",
      backend: "codex",
      runtime_session_id: "thread_1",
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
    expect(event.session.backend).toBe("codex");
  });

  test("defines backend adapter and orchestrator seams without UI coupling", () => {
    const input: AgentBackendSessionCreateInput = {
      workspace_id: "workspace_1",
      backend: "claude",
      title: "Claude Session",
    };

    const adapter: AgentBackendAdapter = {
      backend: "claude",
      async create_session(input, runtime) {
        expect(input.runtime_context.workspace_target).toBe("local");
        expect(runtime.runtime_context.workspace_target).toBe("local");
        return {
          session: {
            ...input.session,
            runtime_session_id: "claude-session-1",
          },
        };
      },
      async send_turn(_input, session, runtime) {
        expect(session.backend).toBe("claude");
        expect(runtime.runtime_context.workspace_target).toBe("local");
      },
      async cancel_turn(_input, session, runtime) {
        expect(session.id).toBe("agent_session_1");
        expect(runtime.runtime_context.workspace_target).toBe("local");
      },
      async resolve_approval() {},
    };

    const sessions = new Map<string, AgentSessionRecord>();
    const session_store: AgentSessionStore = {
      async save_session(session) {
        sessions.set(session.id, session);
        return session;
      },
      async get_session(agent_session_id) {
        return sessions.get(agent_session_id) ?? null;
      },
      async list_sessions(workspace_id) {
        return [...sessions.values()].filter((session) => session.workspace_id === workspace_id);
      },
    };
    const observed_events: AgentEvent[] = [];
    const orchestrator: AgentOrchestrator = new DefaultAgentOrchestrator({
      adapter_registry: {
        get_adapter() {
          return adapter;
        },
      },
      runtime_resolver: {
        async resolve(workspace_id) {
          return {
            workspace_id,
            workspace_target: "local" satisfies WorkspaceTarget,
            worktree_path: "/tmp/project",
          };
        },
      },
      session_store,
      now: () => "2026-03-21T00:00:00.000Z",
      random_id: () => "agent_session_1",
    });
    orchestrator.subscribe((event) => {
      observed_events.push(event);
    });

    const created_session_promise = orchestrator.create_session(input);

    return created_session_promise.then(async (created_session) => {
      expect(adapter.backend).toBe("claude");
      expect(typeof orchestrator.subscribe).toBe("function");
      expect(created_session.runtime_session_id).toBe("claude-session-1");
      expect(observed_events).toHaveLength(1);
      expect(observed_events[0]?.kind).toBe("agent.session.created");

      await orchestrator.send_turn({
        session_id: created_session.id,
        workspace_id: created_session.workspace_id,
        turn_id: "turn_1",
        input: [{ type: "text", text: "Hello" }],
      });
    });
  });

  test("keeps runtime placement separate from backend selection", async () => {
    const seen_targets: WorkspaceTarget[] = [];
    const session_store: AgentSessionStore = {
      async save_session(session) {
        return session;
      },
      async get_session(agent_session_id) {
        return {
          id: agent_session_id,
          workspace_id: "workspace_cloud",
          runtime_kind: "adapter",
          runtime_name: "codex",
          backend: "codex",
          runtime_session_id: "thread_1",
          title: "Codex Session",
          status: "running",
          created_by: null,
          forked_from_session_id: null,
          last_message_at: null,
          created_at: "2026-03-21T00:00:00.000Z",
          updated_at: "2026-03-21T00:00:00.000Z",
          ended_at: null,
        };
      },
      async list_sessions() {
        return [];
      },
    };
    const adapter: AgentBackendAdapter = {
      backend: "codex",
      async create_session(input) {
        return { session: input.session };
      },
      async send_turn(_input, _session, runtime) {
        seen_targets.push(runtime.runtime_context.workspace_target);
      },
      async cancel_turn() {},
      async resolve_approval() {},
    };
    const orchestrator = new DefaultAgentOrchestrator({
      adapter_registry: {
        get_adapter() {
          return adapter;
        },
      },
      runtime_resolver: {
        async resolve(workspace_id) {
          return {
            workspace_id,
            workspace_target: "cloud",
          };
        },
      },
      session_store,
    });

    await orchestrator.send_turn({
      session_id: "agent_session_1",
      workspace_id: "workspace_cloud",
      turn_id: "turn_1",
      input: [{ type: "text", text: "Ship it." }],
    });

    expect(seen_targets).toEqual(["cloud"]);
  });
});
