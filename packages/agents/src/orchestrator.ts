import type {
  AgentSessionProviderId,
  AgentSessionRecord,
  WorkspaceTarget,
} from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import type { AgentEventObserver } from "./events";
import type { AgentApprovalResolution, AgentTurnCancelRequest, AgentTurnRequest } from "./turn";

export interface AgentSessionContext {
  workspaceId: string;
  workspaceTarget: WorkspaceTarget;
  worktreePath?: string | null;
}

export interface AgentSessionEvents {
  emit: AgentEventObserver;
}

export interface AgentWorker {
  sendTurn(input: AgentTurnRequest): Promise<void>;
  cancelTurn(input: AgentTurnCancelRequest): Promise<void>;
  resolveApproval(input: AgentApprovalResolution): Promise<void>;
}

export interface StartAgentSessionInput {
  provider: AgentSessionProviderId;
  workspaceId: string;
  forkedFromSessionId?: string | null;
}

export interface AgentOrchestrator {
  createDraftSession(input: StartAgentSessionInput): Promise<AgentSessionRecord>;
  bootstrapSession(agentSessionId: string): Promise<AgentSessionRecord>;
  startSession(input: StartAgentSessionInput): Promise<AgentSessionRecord>;
  getSession(agentSessionId: string): Promise<AgentSessionRecord | null>;
  listSessions(workspaceId: string): Promise<AgentSessionRecord[]>;
  attachSession(agentSessionId: string): Promise<void>;
  sendTurn(
    agentSessionId: string,
    input: Omit<AgentTurnRequest, "sessionId" | "workspaceId">,
  ): Promise<void>;
  cancelTurn(
    agentSessionId: string,
    input: Omit<AgentTurnCancelRequest, "sessionId">,
  ): Promise<void>;
  resolveApproval(
    agentSessionId: string,
    input: Omit<AgentApprovalResolution, "sessionId">,
  ): Promise<void>;
  subscribe(observer: AgentEventObserver): () => void;
}

export interface AgentStore {
  saveSession(session: AgentSessionRecord): Promise<AgentSessionRecord>;
  getSession(agentSessionId: string): Promise<AgentSessionRecord | null>;
  listSessions(workspaceId: string): Promise<AgentSessionRecord[]>;
  getWorkspace(workspaceId: string): Promise<AgentSessionContext | null>;
}

export interface CreateAgentOrchestratorDependencies {
  workers: Record<
    AgentSessionProviderId,
    {
      start(
        session: AgentSessionRecord,
        context: AgentSessionContext,
        runtime: WorkspaceRuntime,
        events: AgentSessionEvents,
      ): Promise<{ session: AgentSessionRecord; worker: AgentWorker }>;
      connect(
        session: AgentSessionRecord,
        context: AgentSessionContext,
        runtime: WorkspaceRuntime,
        events: AgentSessionEvents,
      ): Promise<AgentWorker>;
    }
  >;
  resolveRuntime(context: AgentSessionContext): Promise<WorkspaceRuntime> | WorkspaceRuntime;
  store: AgentStore;
  now?: () => string;
  randomId?: () => string;
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
  private readonly connections = new Map<string, AgentWorker>();
  private readonly now: () => string;
  private readonly randomId: () => string;
  private readonly workers: CreateAgentOrchestratorDependencies["workers"];
  private readonly resolveRuntime: CreateAgentOrchestratorDependencies["resolveRuntime"];
  private readonly store: AgentStore;

  constructor(dependencies: Omit<CreateAgentOrchestratorDependencies, "observers">) {
    this.now = dependencies.now ?? defaultNow;
    this.randomId = dependencies.randomId ?? fallbackRandomId;
    this.workers = dependencies.workers;
    this.resolveRuntime = dependencies.resolveRuntime;
    this.store = dependencies.store;
  }

  startSession(input: StartAgentSessionInput): Promise<AgentSessionRecord> {
    return this.startAgentSession(input);
  }

  createDraftSession(input: StartAgentSessionInput): Promise<AgentSessionRecord> {
    return this.createDraftAgentSession(input);
  }

  bootstrapSession(agentSessionId: string): Promise<AgentSessionRecord> {
    return this.bootstrapAgentSession(agentSessionId);
  }

  getSession(agentSessionId: string): Promise<AgentSessionRecord | null> {
    return this.store.getSession(agentSessionId);
  }

  listSessions(workspaceId: string): Promise<AgentSessionRecord[]> {
    return this.store.listSessions(workspaceId);
  }

  async attachSession(agentSessionId: string): Promise<void> {
    const session = await this.requireSession(agentSessionId);
    const context = await this.requireSessionContext(session.workspace_id);
    const runtime = await this.resolveRuntime(context);
    await this.ensureConnection(session, context, runtime, this.createEvents(context));
  }

  sendTurn(
    agentSessionId: string,
    input: Omit<AgentTurnRequest, "sessionId" | "workspaceId">,
  ): Promise<void> {
    return this.sendAgentTurn({
      ...input,
      sessionId: agentSessionId,
    });
  }

  cancelTurn(
    agentSessionId: string,
    input: Omit<AgentTurnCancelRequest, "sessionId">,
  ): Promise<void> {
    return this.cancelAgentTurn({
      ...input,
      sessionId: agentSessionId,
    });
  }

  resolveApproval(
    agentSessionId: string,
    input: Omit<AgentApprovalResolution, "sessionId">,
  ): Promise<void> {
    return this.resolveAgentApproval({
      ...input,
      sessionId: agentSessionId,
    });
  }

  subscribe(observer: AgentEventObserver): () => void {
    this.listeners.add(observer);
    return () => {
      this.listeners.delete(observer);
    };
  }

  private async startAgentSession(input: StartAgentSessionInput): Promise<AgentSessionRecord> {
    const draftSession = await this.createDraftAgentSession(input);
    return this.bootstrapAgentSession(draftSession.id);
  }

  private async createDraftAgentSession(
    input: StartAgentSessionInput,
  ): Promise<AgentSessionRecord> {
    const timestamp = this.now();
    const draftSession: AgentSessionRecord = {
      id: this.randomId(),
      workspace_id: input.workspaceId,
      runtime_kind: "native",
      runtime_name: input.provider,
      provider: input.provider,
      provider_session_id: null,
      title: "",
      status: "starting",
      created_by: null,
      forked_from_session_id: input.forkedFromSessionId ?? null,
      last_message_at: null,
      created_at: timestamp,
      updated_at: timestamp,
      ended_at: null,
    };
    const persisted = await this.store.saveSession(draftSession);

    await this.broadcast({
      kind: "agent.session.created",
      workspaceId: persisted.workspace_id,
      session: persisted,
    });

    return persisted;
  }

  private async bootstrapAgentSession(agentSessionId: string): Promise<AgentSessionRecord> {
    const session = await this.requireSession(agentSessionId);
    if (this.connections.has(session.id)) {
      return session;
    }

    const context = await this.requireSessionContext(session.workspace_id);
    const runtime = await this.resolveRuntime(context);
    const events = this.createEvents(context);

    try {
      const result = await this.workers[session.provider].start(session, context, runtime, events);
      const bootstrappedSession: AgentSessionRecord =
        result.session.status === "starting"
          ? { ...result.session, status: "idle", updated_at: this.now() }
          : result.session;
      const persisted = await this.store.saveSession(bootstrappedSession);
      this.connections.set(persisted.id, result.worker);

      if (!this.sessionsEqualForBootstrap(session, persisted)) {
        await this.broadcast({
          kind: "agent.session.updated",
          workspaceId: persisted.workspace_id,
          session: persisted,
        });
      }

      return persisted;
    } catch (error) {
      const failedSession = await this.persistSessionUpdate(session, {
        status: "failed",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspaceId: failedSession.workspace_id,
        session: failedSession,
      });
      await this.broadcast({
        kind: "agent.status.updated",
        workspaceId: failedSession.workspace_id,
        sessionId: failedSession.id,
        status: "startup failed",
        detail: error instanceof Error ? error.message : "Agent startup failed.",
      });
      throw error;
    }
  }

  private async sendAgentTurn(input: Omit<AgentTurnRequest, "workspaceId">): Promise<void> {
    const session = await this.requireSession(input.sessionId);
    const context = await this.requireSessionContext(session.workspace_id);
    const runtime = await this.resolveRuntime(context);
    const events = this.createEvents(context);
    const updatedSession = await this.persistSessionUpdate(session, {
      last_message_at: this.now(),
      status: "running",
      updated_at: this.now(),
    });

    await events.emit({
      kind: "agent.session.updated",
      workspaceId: updatedSession.workspace_id,
      session: updatedSession,
    });
    await events.emit({
      kind: "agent.turn.started",
      workspaceId: updatedSession.workspace_id,
      sessionId: updatedSession.id,
      turnId: input.turnId,
    });
    await events.emit({
      kind: "agent.message.created",
      workspaceId: updatedSession.workspace_id,
      sessionId: updatedSession.id,
      messageId: `${input.turnId}:user`,
      role: "user",
      turnId: input.turnId,
    });
    for (const [index, part] of input.input.entries()) {
      await events.emit({
        kind: "agent.message.part.completed",
        workspaceId: updatedSession.workspace_id,
        sessionId: updatedSession.id,
        messageId: `${input.turnId}:user`,
        partId: `${input.turnId}:user:part:${index + 1}`,
        part:
          part.type === "text"
            ? { type: "text", text: part.text }
            : part.type === "image"
              ? { type: "image", mediaType: part.mediaType, base64Data: part.base64Data }
              : { type: "attachment_ref", attachmentId: part.attachmentId },
      });
    }

    try {
      const connection = await this.ensureConnection(updatedSession, context, runtime, events);
      await connection.sendTurn({
        ...input,
        workspaceId: session.workspace_id,
      });
    } catch (error) {
      await events.emit({
        kind: "agent.turn.failed",
        workspaceId: updatedSession.workspace_id,
        sessionId: updatedSession.id,
        turnId: input.turnId,
        error: error instanceof Error ? error.message : "Agent turn failed.",
      });
      throw error;
    }
  }

  private async cancelAgentTurn(input: AgentTurnCancelRequest): Promise<void> {
    const session = await this.requireSession(input.sessionId);
    const context = await this.requireSessionContext(session.workspace_id);
    const runtime = await this.resolveRuntime(context);
    const connection = await this.ensureConnection(
      session,
      context,
      runtime,
      this.createEvents(context),
    );
    await connection.cancelTurn(input);
  }

  private async resolveAgentApproval(input: AgentApprovalResolution): Promise<void> {
    const session = await this.requireSession(input.sessionId);
    const context = await this.requireSessionContext(session.workspace_id);
    const runtime = await this.resolveRuntime(context);
    const connection = await this.ensureConnection(
      session,
      context,
      runtime,
      this.createEvents(context),
    );
    await connection.resolveApproval(input);
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
      const session = await this.requireSession(event.sessionId);
      const updatedSession = await this.persistSessionUpdate(session, {
        last_message_at: this.now(),
        status: "idle",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspaceId: updatedSession.workspace_id,
        session: updatedSession,
      });
    }

    if (event.kind === "agent.turn.failed") {
      const session = await this.requireSession(event.sessionId);
      const updatedSession = await this.persistSessionUpdate(session, {
        status: "failed",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspaceId: updatedSession.workspace_id,
        session: updatedSession,
      });
    }

    if (event.kind === "agent.approval.requested") {
      const session = await this.requireSession(event.sessionId);
      const updatedSession = await this.persistSessionUpdate(session, {
        status: event.approval.kind === "question" ? "waiting_input" : "waiting_approval",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspaceId: updatedSession.workspace_id,
        session: updatedSession,
      });
    }

    if (event.kind === "agent.approval.resolved") {
      const session = await this.requireSession(event.sessionId);
      const updatedSession = await this.persistSessionUpdate(session, {
        status: "running",
        updated_at: this.now(),
      });
      await this.broadcast({
        kind: "agent.session.updated",
        workspaceId: updatedSession.workspace_id,
        session: updatedSession,
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

  private async requireSession(agentSessionId: string): Promise<AgentSessionRecord> {
    const session = await this.store.getSession(agentSessionId);
    if (!session) {
      throw new Error(`Agent session ${agentSessionId} was not found.`);
    }

    return session;
  }

  private async requireSessionContext(workspaceId: string): Promise<AgentSessionContext> {
    const context = await this.store.getWorkspace(workspaceId);
    if (!context) {
      throw new Error(`Workspace ${workspaceId} was not found.`);
    }

    return context;
  }

  private async ensureConnection(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    runtime: WorkspaceRuntime,
    events: AgentSessionEvents,
  ): Promise<AgentWorker> {
    const existing = this.connections.get(session.id);
    if (existing) {
      return existing;
    }

    const connection = await this.workers[session.provider].connect(
      session,
      context,
      runtime,
      events,
    );
    this.connections.set(session.id, connection);
    return connection;
  }

  private sessionsEqualForBootstrap(
    previous: AgentSessionRecord,
    next: AgentSessionRecord,
  ): boolean {
    return (
      previous.id === next.id &&
      previous.workspace_id === next.workspace_id &&
      previous.runtime_kind === next.runtime_kind &&
      previous.runtime_name === next.runtime_name &&
      previous.provider === next.provider &&
      previous.provider_session_id === next.provider_session_id &&
      previous.title === next.title &&
      previous.status === next.status &&
      previous.created_by === next.created_by &&
      previous.forked_from_session_id === next.forked_from_session_id &&
      previous.last_message_at === next.last_message_at &&
      previous.created_at === next.created_at &&
      previous.updated_at === next.updated_at &&
      previous.ended_at === next.ended_at
    );
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
