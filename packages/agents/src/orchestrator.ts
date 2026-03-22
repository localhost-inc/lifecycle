import type { AgentSessionRecord } from "@lifecycle/contracts";
import type {
  AgentAdapterRuntime,
  AgentBackendAdapter,
  AgentBackendSessionCreateInput,
} from "./adapter";
import type { AgentEventObserver } from "./events";
import type { AgentRuntimeContext, AgentRuntimeResolver } from "./runtime";
import type { AgentApprovalResolution, AgentTurnCancelRequest, AgentTurnRequest } from "./turn";

export interface AgentSessionStore {
  save_session(session: AgentSessionRecord): Promise<AgentSessionRecord>;
  get_session(agent_session_id: string): Promise<AgentSessionRecord | null>;
  list_sessions(workspace_id: string): Promise<AgentSessionRecord[]>;
}

export interface AgentOrchestrator {
  create_session(input: AgentBackendSessionCreateInput): Promise<AgentSessionRecord>;
  get_session(agent_session_id: string): Promise<AgentSessionRecord | null>;
  list_sessions(workspace_id: string): Promise<AgentSessionRecord[]>;
  send_turn(input: AgentTurnRequest): Promise<void>;
  cancel_turn(input: AgentTurnCancelRequest): Promise<void>;
  resolve_approval(input: AgentApprovalResolution): Promise<void>;
  subscribe(observer: AgentEventObserver): () => void;
}

export interface AgentAdapterRegistry {
  get_adapter(
    session: AgentSessionRecord,
    runtime_context: AgentRuntimeContext,
  ): AgentBackendAdapter;
}

export interface DefaultAgentOrchestratorDependencies {
  adapter_registry: AgentAdapterRegistry;
  runtime_resolver: AgentRuntimeResolver;
  session_store: AgentSessionStore;
  now?: () => string;
  random_id?: () => string;
}

function fallbackRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-session-${Date.now()}`;
}

function defaultNow(): string {
  return new Date().toISOString();
}

export class DefaultAgentOrchestrator implements AgentOrchestrator {
  private readonly listeners = new Set<AgentEventObserver>();
  private readonly adapter_registry: AgentAdapterRegistry;
  private readonly now: () => string;
  private readonly random_id: () => string;
  private readonly runtime_resolver: AgentRuntimeResolver;
  private readonly session_store: AgentSessionStore;

  constructor(dependencies: DefaultAgentOrchestratorDependencies) {
    this.adapter_registry = dependencies.adapter_registry;
    this.now = dependencies.now ?? defaultNow;
    this.random_id = dependencies.random_id ?? fallbackRandomId;
    this.runtime_resolver = dependencies.runtime_resolver;
    this.session_store = dependencies.session_store;
  }

  async create_session(input: AgentBackendSessionCreateInput): Promise<AgentSessionRecord> {
    const runtime_context = await this.runtime_resolver.resolve(input.workspace_id);
    const timestamp = this.now();
    const draft_session: AgentSessionRecord = {
      id: this.random_id(),
      workspace_id: input.workspace_id,
      runtime_kind: input.runtime_kind ?? "adapter",
      runtime_name: input.backend,
      backend: input.backend,
      runtime_session_id: input.runtime_session_id ?? null,
      title: input.title?.trim() || "Agent Session",
      status: "idle",
      created_by: null,
      forked_from_session_id: input.forked_from_session_id ?? null,
      last_message_at: null,
      created_at: timestamp,
      updated_at: timestamp,
      ended_at: null,
    };
    const adapter = this.adapter_registry.get_adapter(draft_session, runtime_context);
    const runtime = this.create_adapter_runtime(runtime_context);
    const result = await adapter.create_session(
      {
        session: draft_session,
        runtime_context,
      },
      runtime,
    );
    const persisted = await this.session_store.save_session(result.session);

    await runtime.emit({
      kind: "agent.session.created",
      workspace_id: persisted.workspace_id,
      session: persisted,
    });

    return persisted;
  }

  get_session(agent_session_id: string): Promise<AgentSessionRecord | null> {
    return this.session_store.get_session(agent_session_id);
  }

  list_sessions(workspace_id: string): Promise<AgentSessionRecord[]> {
    return this.session_store.list_sessions(workspace_id);
  }

  async send_turn(input: AgentTurnRequest): Promise<void> {
    const session = await this.require_session(input.session_id);
    const runtime_context = await this.runtime_resolver.resolve(session.workspace_id);
    const adapter = this.adapter_registry.get_adapter(session, runtime_context);

    await adapter.send_turn(input, session, this.create_adapter_runtime(runtime_context));
  }

  async cancel_turn(input: AgentTurnCancelRequest): Promise<void> {
    const session = await this.require_session(input.session_id);
    const runtime_context = await this.runtime_resolver.resolve(session.workspace_id);
    const adapter = this.adapter_registry.get_adapter(session, runtime_context);

    await adapter.cancel_turn(input, session, this.create_adapter_runtime(runtime_context));
  }

  async resolve_approval(input: AgentApprovalResolution): Promise<void> {
    const session = await this.require_session(input.session_id);
    const runtime_context = await this.runtime_resolver.resolve(session.workspace_id);
    const adapter = this.adapter_registry.get_adapter(session, runtime_context);

    await adapter.resolve_approval(input, session, this.create_adapter_runtime(runtime_context));
  }

  subscribe(observer: AgentEventObserver): () => void {
    this.listeners.add(observer);
    return () => {
      this.listeners.delete(observer);
    };
  }

  private create_adapter_runtime(runtime_context: AgentRuntimeContext): AgentAdapterRuntime {
    return {
      emit: async (event) => {
        for (const listener of this.listeners) {
          await listener(event);
        }
      },
      runtime_context,
    };
  }

  private async require_session(agent_session_id: string): Promise<AgentSessionRecord> {
    const session = await this.session_store.get_session(agent_session_id);
    if (!session) {
      throw new Error(`Agent session ${agent_session_id} was not found.`);
    }

    return session;
  }
}
