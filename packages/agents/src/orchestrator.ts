import type {
  AgentSessionProviderId,
  AgentSessionRecord,
  WorkspaceTarget,
} from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import type { AgentEventObserver } from "./events";
import type {
  AgentApprovalResolution,
  AgentTurnCancelRequest,
  AgentTurnRequest,
} from "./turn";

export interface AgentSessionContext {
  workspace_id: string;
  workspace_target: WorkspaceTarget;
  worktree_path?: string | null;
}

export interface AgentSessionEvents {
  emit: AgentEventObserver;
}

export interface AgentWorker {
  sendTurn(input: AgentTurnRequest): Promise<void>;
  cancelTurn(input: AgentTurnCancelRequest): Promise<void>;
  resolveApproval(input: AgentApprovalResolution): Promise<void>;
}

export interface AgentWorkerLauncher {
  startWorker(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<{ session: AgentSessionRecord; worker: AgentWorker }>;
  connectWorker(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<AgentWorker>;
}

export interface StartAgentSessionInput {
  provider: AgentSessionProviderId;
  workspace_id: string;
  forked_from_session_id?: string | null;
}

export interface AgentSession {
  readonly record: AgentSessionRecord;
  refresh(): Promise<AgentSessionRecord>;
  sendTurn(
    input: Omit<AgentTurnRequest, "session_id" | "workspace_id">,
  ): Promise<void>;
  cancelTurn(
    input: Omit<AgentTurnCancelRequest, "session_id" | "workspace_id">,
  ): Promise<void>;
  resolveApproval(
    input: Omit<AgentApprovalResolution, "session_id" | "workspace_id">,
  ): Promise<void>;
}

export interface AgentOrchestrator {
  startSession(input: StartAgentSessionInput): Promise<AgentSession>;
  getSession(agent_session_id: string): Promise<AgentSession | null>;
  listSessions(workspace_id: string): Promise<AgentSession[]>;
  subscribe(observer: AgentEventObserver): () => void;
}

export interface AgentStore {
  saveSession(session: AgentSessionRecord): Promise<AgentSessionRecord>;
  getSession(agent_session_id: string): Promise<AgentSessionRecord | null>;
  listSessions(workspace_id: string): Promise<AgentSessionRecord[]>;
  getWorkspace(workspace_id: string): Promise<AgentSessionContext | null>;
}

export interface CreateAgentOrchestratorDependencies {
  workerLaunchers: Record<AgentSessionProviderId, AgentWorkerLauncher>;
  resolveRuntime(
    context: AgentSessionContext,
  ): Promise<WorkspaceRuntime> | WorkspaceRuntime;
  store: AgentStore;
  now?: () => string;
  random_id?: () => string;
  observers?: AgentEventObserver[];
}

function fallbackRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-session-${Date.now()}`;
}

function defaultNow(): string {
  return new Date().toISOString();
}

class AgentOrchestratorImpl implements AgentOrchestrator {
  private readonly listeners = new Set<AgentEventObserver>();
  private readonly workers = new Map<string, AgentWorker>();
  private readonly now: () => string;
  private readonly random_id: () => string;
  private readonly workerLaunchers: CreateAgentOrchestratorDependencies["workerLaunchers"];
  private readonly resolveRuntime: CreateAgentOrchestratorDependencies["resolveRuntime"];
  private readonly store: AgentStore;

  constructor(dependencies: Omit<CreateAgentOrchestratorDependencies, "observers">) {
    this.now = dependencies.now ?? defaultNow;
    this.random_id = dependencies.random_id ?? fallbackRandomId;
    this.workerLaunchers = dependencies.workerLaunchers;
    this.resolveRuntime = dependencies.resolveRuntime;
    this.store = dependencies.store;
  }

  startSession(input: StartAgentSessionInput): Promise<AgentSession> {
    return this.startAgentSession(input);
  }

  async getSession(agent_session_id: string): Promise<AgentSession | null> {
    const session = await this.store.getSession(agent_session_id);
    return session ? this.bindSession(session) : null;
  }

  async listSessions(workspace_id: string): Promise<AgentSession[]> {
    const sessions = await this.store.listSessions(workspace_id);
    return sessions.map((session) => this.bindSession(session));
  }

  subscribe(observer: AgentEventObserver): () => void {
    this.listeners.add(observer);
    return () => {
      this.listeners.delete(observer);
    };
  }

  private async startAgentSession(input: StartAgentSessionInput): Promise<AgentSession> {
    const context = await this.requireSessionContext(input.workspace_id);
    const runtime = await this.resolveRuntime(context);
    const timestamp = this.now();
    const draft_session: AgentSessionRecord = {
      id: this.random_id(),
      workspace_id: input.workspace_id,
      runtime_kind: "native",
      runtime_name: input.provider,
      provider: input.provider,
      provider_session_id: null,
      title: "",
      status: "idle",
      created_by: null,
      forked_from_session_id: input.forked_from_session_id ?? null,
      last_message_at: null,
      created_at: timestamp,
      updated_at: timestamp,
      ended_at: null,
    };
    const workerLauncher = this.workerLaunchers[draft_session.provider];
    const events = this.createEvents(context);
    const result = await workerLauncher.startWorker(draft_session, context, runtime, events);
    const persisted = await this.store.saveSession(result.session);
    this.workers.set(persisted.id, result.worker);

    await events.emit({
      kind: "agent.session.created",
      workspace_id: persisted.workspace_id,
      session: persisted,
    });

    return this.bindSession(persisted);
  }

  private async sendAgentTurn(input: AgentTurnRequest): Promise<void> {
    const session = await this.requireSession(input.session_id);
    const context = await this.requireSessionContext(session.workspace_id);
    const runtime = await this.resolveRuntime(context);
    const events = this.createEvents(context);
    const updated_session = await this.persistSessionUpdate(session, {
      last_message_at: this.now(),
      status: "running",
      updated_at: this.now(),
    });

    await events.emit({
      kind: "agent.session.updated",
      workspace_id: updated_session.workspace_id,
      session: updated_session,
    });
    await events.emit({
      kind: "agent.turn.started",
      workspace_id: updated_session.workspace_id,
      session_id: updated_session.id,
      turn_id: input.turn_id,
    });
    await events.emit({
      kind: "agent.message.created",
      workspace_id: updated_session.workspace_id,
      session_id: updated_session.id,
      message_id: `${input.turn_id}:user`,
      role: "user",
      turn_id: input.turn_id,
    });
    for (const [index, part] of input.input.entries()) {
      await events.emit({
        kind: "agent.message.part.completed",
        workspace_id: updated_session.workspace_id,
        session_id: updated_session.id,
        message_id: `${input.turn_id}:user`,
        part_id: `${input.turn_id}:user:part:${index + 1}`,
        part:
          part.type === "text"
            ? { type: "text", text: part.text }
            : { type: "attachment_ref", attachment_id: part.attachment_id },
      });
    }

    try {
      const worker = await this.ensureWorker(updated_session, context, runtime, events);
      await worker.sendTurn(input);
    } catch (error) {
      await events.emit({
        kind: "agent.turn.failed",
        workspace_id: updated_session.workspace_id,
        session_id: updated_session.id,
        turn_id: input.turn_id,
        error: error instanceof Error ? error.message : "Agent turn failed.",
      });
      throw error;
    }
  }

  private async cancelAgentTurn(input: AgentTurnCancelRequest): Promise<void> {
    const session = await this.requireSession(input.session_id);
    const context = await this.requireSessionContext(session.workspace_id);
    const runtime = await this.resolveRuntime(context);
    const worker = await this.ensureWorker(session, context, runtime, this.createEvents(context));
    await worker.cancelTurn(input);
  }

  private async resolveAgentApproval(input: AgentApprovalResolution): Promise<void> {
    const session = await this.requireSession(input.session_id);
    const context = await this.requireSessionContext(session.workspace_id);
    const runtime = await this.resolveRuntime(context);
    const worker = await this.ensureWorker(session, context, runtime, this.createEvents(context));
    await worker.resolveApproval(input);
  }

  private createEvents(context: AgentSessionContext): AgentSessionEvents {
    return {
      emit: async (event) => {
        await this.handleEvent(context, event);
      },
    };
  }

  private async handleEvent(
    context: AgentSessionContext,
    event: Parameters<AgentEventObserver>[0],
  ): Promise<void> {
    if (event.kind === "agent.turn.completed") {
      const session = await this.requireSession(event.session_id);
      const updated_session = await this.persistSessionUpdate(session, {
        last_message_at: this.now(),
        status: "idle",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspace_id: updated_session.workspace_id,
        session: updated_session,
      });
    }

    if (event.kind === "agent.turn.failed") {
      const session = await this.requireSession(event.session_id);
      const updated_session = await this.persistSessionUpdate(session, {
        status: "failed",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspace_id: updated_session.workspace_id,
        session: updated_session,
      });
    }

    if (event.kind === "agent.approval.requested") {
      const session = await this.requireSession(event.session_id);
      const updated_session = await this.persistSessionUpdate(session, {
        status: event.approval.kind === "question" ? "waiting_input" : "waiting_approval",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspace_id: updated_session.workspace_id,
        session: updated_session,
      });
    }

    if (event.kind === "agent.approval.resolved") {
      const session = await this.requireSession(event.session_id);
      const updated_session = await this.persistSessionUpdate(session, {
        status: "running",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspace_id: updated_session.workspace_id,
        session: updated_session,
      });
    }

    await this.broadcast(event);
    void context;
  }

  private async broadcast(event: Parameters<AgentEventObserver>[0]): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event);
    }
  }

  private async persistSessionUpdate(
    session: AgentSessionRecord,
    patch: Partial<AgentSessionRecord>,
  ): Promise<AgentSessionRecord> {
    return this.store.saveSession({
      ...session,
      ...patch,
    });
  }

  private async requireSession(agent_session_id: string): Promise<AgentSessionRecord> {
    const session = await this.store.getSession(agent_session_id);
    if (!session) {
      throw new Error(`Agent session ${agent_session_id} was not found.`);
    }

    return session;
  }

  private async requireSessionContext(workspace_id: string): Promise<AgentSessionContext> {
    const context = await this.store.getWorkspace(workspace_id);
    if (!context) {
      throw new Error(`Workspace ${workspace_id} was not found.`);
    }

    return context;
  }

  private async ensureWorker(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<AgentWorker> {
    const existing = this.workers.get(session.id);
    if (existing) {
      return existing;
    }

    const worker = await this.workerLaunchers[session.provider].connectWorker(
      session,
      context,
      runtime,
      events,
    );
    this.workers.set(session.id, worker);
    return worker;
  }

  private bindSession(session: AgentSessionRecord): AgentSession {
    let currentRecord = session;

    return {
      get record() {
        return currentRecord;
      },
      refresh: async () => {
        currentRecord = await this.requireSession(currentRecord.id);
        return currentRecord;
      },
      sendTurn: (input) =>
        this.sendAgentTurn({
          ...input,
          session_id: currentRecord.id,
          workspace_id: currentRecord.workspace_id,
        }),
      cancelTurn: (input) =>
        this.cancelAgentTurn({
          ...input,
          session_id: currentRecord.id,
        }),
      resolveApproval: (input) =>
        this.resolveAgentApproval({
          ...input,
          session_id: currentRecord.id,
        }),
    };
  }
}

export function createAgentOrchestrator(
  dependencies: CreateAgentOrchestratorDependencies,
): AgentOrchestrator {
  const { observers = [], ...orchestratorDependencies } = dependencies;
  const orchestrator = new AgentOrchestratorImpl(orchestratorDependencies);

  for (const observer of observers) {
    orchestrator.subscribe(observer);
  }

  return orchestrator;
}
