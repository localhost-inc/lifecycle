import type {
  AgentSessionProviderId,
  AgentSessionRecord,
  WorkspaceHost,
} from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import {
  saveAgentSession,
  selectAgentSessionById,
  selectAgentSessionsByWorkspace,
  selectWorkspaceById,
  type AgentSessionCollectionRegistry,
} from "@lifecycle/store";
import type { WorkspaceClient } from "@lifecycle/workspace/client";
import type { AgentModelCatalog } from "./catalog";
import type { AgentEventObserver } from "./events";
import type {
  AgentAuthOptions,
  AgentModelCatalogOptions,
  AgentWorker,
  AgentWorkerCallbacks,
} from "./worker";
import type { AgentAuthStatus } from "./providers/auth";
import type { AgentApprovalResolution, AgentTurnCancelRequest, AgentTurnRequest } from "./turn";
import type { AgentWorkerEvent, AgentWorkerSnapshot } from "./worker/protocol";

export interface AgentSessionContext {
  workspaceId: string;
  workspaceHost: WorkspaceHost;
  worktreePath?: string | null;
}

export interface AgentSessionEvents {
  emit: AgentEventObserver;
}

export interface StartAgentSessionInput {
  provider: AgentSessionProviderId;
  workspaceId: string;
}

export interface AgentClient {
  readonly workspaceHost: WorkspaceHost;
  checkAuth(provider: AgentSessionProviderId): Promise<AgentAuthStatus>;
  getModelCatalog(
    provider: AgentSessionProviderId,
    options: AgentModelCatalogOptions,
  ): Promise<AgentModelCatalog>;
  login(
    provider: AgentSessionProviderId,
    onStatus?: (status: AgentAuthStatus) => void,
    options?: AgentAuthOptions,
  ): Promise<AgentAuthStatus>;
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

export interface CreateAgentClientDependencies {
  agentSessionRegistry: AgentSessionCollectionRegistry;
  agentWorker: AgentWorker;
  driver: SqlDriver;
  workspaceClient: WorkspaceClient;
  workspaceHost: WorkspaceHost;
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

function isRecoverableConnectionError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("agent runtime") ||
    message.includes("connection is not open") ||
    message.includes("closed before connecting") ||
    message.includes("failed to connect") ||
    message.includes("stale connection")
  );
}

function formatConnectionFailureStatus(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Agent runtime unavailable.";
}

class AgentClientImpl implements AgentClient {
  readonly workspaceHost: WorkspaceHost;
  private readonly listeners = new Set<AgentEventObserver>();
  private readonly eventBuffer: Array<Parameters<AgentEventObserver>[0]> = [];
  private subscriberConnected = false;
  private readonly now: () => string;
  private readonly randomId: () => string;
  private readonly agentSessionRegistry: AgentSessionCollectionRegistry;
  private readonly agentWorker: AgentWorker;
  private readonly driver: SqlDriver;
  private readonly workspaceClient: WorkspaceClient;

  constructor(dependencies: Omit<CreateAgentClientDependencies, "observers">) {
    this.now = dependencies.now ?? defaultNow;
    this.randomId = dependencies.randomId ?? fallbackRandomId;
    this.agentSessionRegistry = dependencies.agentSessionRegistry;
    this.agentWorker = dependencies.agentWorker;
    this.driver = dependencies.driver;
    this.workspaceClient = dependencies.workspaceClient;
    this.workspaceHost = dependencies.workspaceHost;
  }

  checkAuth(provider: AgentSessionProviderId): Promise<AgentAuthStatus> {
    return this.agentWorker.checkAuth(provider);
  }

  getModelCatalog(
    provider: AgentSessionProviderId,
    options: AgentModelCatalogOptions,
  ): Promise<AgentModelCatalog> {
    return this.agentWorker.getModelCatalog(provider, options);
  }

  login(
    provider: AgentSessionProviderId,
    onStatus?: (status: AgentAuthStatus) => void,
    options?: AgentAuthOptions,
  ): Promise<AgentAuthStatus> {
    return this.agentWorker.login(provider, onStatus, options);
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
    return this.getPersistedSession(agentSessionId);
  }

  listSessions(workspaceId: string): Promise<AgentSessionRecord[]> {
    return selectAgentSessionsByWorkspace(this.driver, workspaceId);
  }

  async attachSession(agentSessionId: string): Promise<void> {
    const session = await this.requireSession(agentSessionId);
    const context = await this.requireSessionContext(session.workspace_id);
    const events = this.createEvents(context);
    await this.agentWorker.attachSession(
      session,
      context,
      this.workspaceClient,
      this.createWorkerCallbacks(session, context, events),
    );
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

    // Flush any events that were buffered before the first subscriber connected.
    if (!this.subscriberConnected && this.eventBuffer.length > 0) {
      this.subscriberConnected = true;
      const buffered = this.eventBuffer.splice(0);
      void (async () => {
        for (const event of buffered) {
          for (const listener of this.listeners) {
            await listener(event);
          }
        }
      })();
    }
    this.subscriberConnected = true;

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
    await this.requireSessionContext(input.workspaceId);
    const timestamp = this.now();
    const draftSession: AgentSessionRecord = {
      id: this.randomId(),
      workspace_id: input.workspaceId,
      provider: input.provider,
      provider_session_id: null,
      title: "",
      status: "starting",
      last_message_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const persisted = await this.persistSession(draftSession);

    await this.broadcast({
      kind: "agent.session.created",
      workspaceId: persisted.workspace_id,
      session: persisted,
    });

    return persisted;
  }

  private async bootstrapAgentSession(agentSessionId: string): Promise<AgentSessionRecord> {
    const session = await this.requireSession(agentSessionId);
    const context = await this.requireSessionContext(session.workspace_id);
    const events = this.createEvents(context);

    try {
      const result = await this.agentWorker.startSession(
        session,
        context,
        this.workspaceClient,
        this.createWorkerCallbacks(session, context, events),
      );
      const bootstrappedSession: AgentSessionRecord =
        result.status === "starting"
          ? { ...result, status: "idle", updated_at: this.now() }
          : result;
      const persisted = await this.persistSession(bootstrappedSession);

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
      await this.withWorkerRetry(updatedSession, events, () =>
        this.agentWorker.sendTurn(
          session,
          context,
          this.workspaceClient,
          this.createWorkerCallbacks(session, context, events),
          {
            ...input,
            workspaceId: session.workspace_id,
          },
        ),
      );
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
    const events = this.createEvents(context);
    await this.withWorkerRetry(session, events, () =>
      this.agentWorker.cancelTurn(
        session,
        context,
        this.workspaceClient,
        this.createWorkerCallbacks(session, context, events),
        input,
      ),
    );
  }

  private async resolveAgentApproval(input: AgentApprovalResolution): Promise<void> {
    const session = await this.requireSession(input.sessionId);
    const context = await this.requireSessionContext(session.workspace_id);
    const events = this.createEvents(context);
    await this.withWorkerRetry(session, events, () =>
      this.agentWorker.resolveApproval(
        session,
        context,
        this.workspaceClient,
        this.createWorkerCallbacks(session, context, events),
        input,
      ),
    );
  }

  private createEvents(context: AgentSessionContext): AgentSessionEvents {
    return {
      emit: async (event) => {
        await this.handleEvent(context, event);
      },
    };
  }

  private createWorkerCallbacks(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    events: AgentSessionEvents,
  ): AgentWorkerCallbacks {
    return {
      onState: async (snapshot) => {
        if (snapshot.sessionId !== session.id || snapshot.provider !== session.provider) {
          return;
        }

        await this.applyRuntimeStateSnapshot(session.id, context.workspaceId, snapshot, events);
      },
      onEvent: async (event) => {
        if (event.kind === "worker.ready") {
          await this.updateSessionProviderBinding(
            session.id,
            context.workspaceId,
            event.providerSessionId,
            events,
          );
          return;
        }

        await this.emitRuntimeEvent(
          session.id,
          context.workspaceId,
          session.provider,
          event,
          events,
        );
      },
    };
  }

  private async updateSessionProviderBinding(
    sessionId: string,
    workspaceId: string,
    providerSessionId: string,
    events: AgentSessionEvents,
  ): Promise<AgentSessionRecord> {
    const session = await this.requireSession(sessionId);
    if (session.provider_session_id === providerSessionId) {
      return session;
    }

    const nextSession = await this.persistSessionUpdate(session, {
      provider_session_id: providerSessionId,
    });
    await events.emit({
      kind: "agent.session.updated",
      workspaceId,
      session: nextSession,
    });
    return nextSession;
  }

  private async applyRuntimeStateSnapshot(
    sessionId: string,
    workspaceId: string,
    snapshot: AgentWorkerSnapshot,
    events: AgentSessionEvents,
  ): Promise<AgentSessionRecord> {
    const session = await this.requireSession(sessionId);
    const nextStatus = snapshot.status === "starting" ? session.status : snapshot.status;
    const nextProviderSessionId =
      snapshot.providerSessionId?.trim() &&
      snapshot.providerSessionId !== session.provider_session_id
        ? snapshot.providerSessionId.trim()
        : session.provider_session_id;

    if (nextProviderSessionId === session.provider_session_id && nextStatus === session.status) {
      return session;
    }

    const nextSession = await this.persistSessionUpdate(session, {
      provider_session_id: nextProviderSessionId,
      status: nextStatus,
    });
    await events.emit({
      kind: "agent.session.updated",
      workspaceId,
      session: nextSession,
    });
    return nextSession;
  }

  private async emitRuntimeEvent(
    sessionId: string,
    workspaceId: string,
    provider: AgentSessionProviderId,
    event: AgentWorkerEvent,
    events: AgentSessionEvents,
  ): Promise<void> {
    switch (event.kind) {
      case "agent.message.delta":
        await events.emit({
          kind: "agent.message.part.delta",
          messageId: `${event.turnId}:assistant`,
          part: { type: "text", text: event.text },
          partId: `${event.turnId}:assistant:${event.blockId}`,
          sessionId,
          workspaceId,
        });
        return;
      case "agent.thinking.delta":
        await events.emit({
          kind: "agent.message.part.delta",
          messageId: `${event.turnId}:assistant`,
          part: { type: "thinking", text: event.text },
          partId: `${event.turnId}:assistant:${event.blockId}`,
          sessionId,
          workspaceId,
        });
        return;
      case "agent.tool_use.start":
        await events.emit({
          kind: "agent.message.part.delta",
          messageId: `${event.turnId}:assistant`,
          part: { type: "tool_call", toolCallId: event.toolUseId, toolName: event.toolName },
          partId: `${event.turnId}:assistant:tool:${event.toolUseId}`,
          sessionId,
          workspaceId,
        });
        return;
      case "agent.tool_use.input":
        await events.emit({
          kind: "agent.message.part.completed",
          messageId: `${event.turnId}:assistant`,
          part: {
            type: "tool_call",
            toolCallId: event.toolUseId,
            toolName: event.toolName,
            inputJson: event.inputJson,
          },
          partId: `${event.turnId}:assistant:tool:${event.toolUseId}`,
          sessionId,
          workspaceId,
        });
        return;
      case "agent.tool_progress":
        await events.emit({
          kind: "agent.message.part.delta",
          messageId: `${event.turnId}:assistant`,
          part: {
            type: "status",
            text: `${event.toolName} (${Math.round(event.elapsedTimeSeconds)}s)`,
          },
          partId: `${event.turnId}:assistant:tool:${event.toolUseId}:progress`,
          sessionId,
          workspaceId,
        });
        return;
      case "agent.item.completed":
      case "agent.item.started":
      case "agent.item.updated":
        switch (event.item.type) {
          case "agent_message":
          case "reasoning":
            return;
          case "tool_call":
            await events.emit({
              kind: "agent.message.part.completed",
              messageId: `${event.turnId}:assistant`,
              part: {
                type: "tool_call",
                toolCallId: event.item.toolCallId,
                toolName: event.item.toolName,
                inputJson: event.item.inputJson,
                outputJson: event.item.outputJson,
                status: event.item.status,
                errorText: event.item.errorText,
              },
              partId: `${event.turnId}:assistant:tool:${event.item.toolCallId}`,
              sessionId,
              workspaceId,
            });
            return;
          case "command_execution":
            await events.emit({
              kind: "agent.message.part.completed",
              messageId: `${event.turnId}:assistant`,
              part: {
                type: "tool_call",
                toolCallId: event.item.id,
                toolName: "command_execution",
                inputJson: JSON.stringify({ command: event.item.command }),
                outputJson: JSON.stringify({
                  command: event.item.command,
                  exitCode: event.item.exitCode ?? null,
                  output: event.item.output,
                }),
                status: event.item.status,
                errorText: event.item.status === "failed" ? event.item.output : undefined,
              },
              partId: `${event.turnId}:assistant:tool:${event.item.id}`,
              sessionId,
              workspaceId,
            });
            return;
          case "file_change":
            await events.emit({
              kind: "agent.message.part.completed",
              messageId: `${event.turnId}:assistant`,
              part: {
                type: "tool_call",
                toolCallId: event.item.id,
                toolName: "file_change",
                inputJson: JSON.stringify({
                  changes: event.item.changes,
                  diff: event.item.diff ?? null,
                }),
                status: event.item.status,
              },
              partId: `${event.turnId}:assistant:tool:${event.item.id}`,
              sessionId,
              workspaceId,
            });
            return;
          case "error":
            await events.emit({
              kind: "agent.tool_call.updated",
              sessionId,
              toolCall: {
                errorText: event.item.message,
                id: event.item.id,
                inputJson: { message: event.item.message },
                outputJson: null,
                sessionId,
                status: "failed",
                toolName: "error",
              },
              workspaceId,
            });
            return;
        }
        return;
      case "agent.approval.requested":
        await events.emit({
          kind: "agent.approval.requested",
          sessionId,
          workspaceId,
          approval: {
            ...event.approval,
            sessionId,
          },
        });
        return;
      case "agent.approval.resolved":
        await events.emit({
          kind: "agent.approval.resolved",
          sessionId,
          workspaceId,
          resolution: {
            ...event.resolution,
            sessionId,
          },
        });
        return;
      case "agent.status":
        await events.emit({
          kind: "agent.status.updated",
          sessionId,
          workspaceId,
          status: event.status,
          detail: event.detail ?? null,
        });
        return;
      case "provider.raw_event":
        await events.emit({
          kind: "agent.provider.event",
          sessionId,
          workspaceId,
          turnId: event.turnId ?? null,
          eventType: event.eventType,
          payload: event.payload,
        });
        return;
      case "agent.turn.completed":
        await events.emit({
          kind: "agent.turn.completed",
          sessionId,
          turnId: event.turnId,
          workspaceId,
          usage: event.usage,
          costUsd: event.costUsd,
        });
        return;
      case "agent.turn.failed":
        await events.emit({
          kind: "agent.turn.failed",
          error: event.error,
          sessionId,
          turnId: event.turnId,
          workspaceId,
        });
        return;
      case "worker.auth_status":
        await events.emit({
          kind: "agent.auth.updated",
          provider,
          authenticated: !event.isAuthenticating && !event.error,
          mode: event.isAuthenticating ? "authenticating" : event.error ? "error" : "ready",
          sessionId,
          workspaceId,
        });
        return;
      case "worker.title_generated": {
        const session = await this.requireSession(sessionId);
        if (session.title.trim().length > 0) {
          return;
        }

        const nextSession = await this.persistSessionUpdate(session, {
          title: event.title,
          updated_at: this.now(),
        });
        await events.emit({
          kind: "agent.session.updated",
          workspaceId,
          session: nextSession,
        });
        return;
      }
      case "worker.ready":
        return;
    }
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
    if (event.kind === "agent.session.updated") {
      const status = event.session.status;
      if (status === "completed" || status === "failed" || status === "cancelled") {
        const context = await this.getWorkspaceContext(event.workspaceId);
        if (context && context.workspaceHost === this.workspaceHost) {
          this.agentWorker.disconnectSession(event.session.id);
        }
      }
    }

    // Buffer events until the first subscriber is connected.
    if (!this.subscriberConnected) {
      this.eventBuffer.push(event);
      return;
    }

    for (const listener of this.listeners) {
      await listener(event);
    }
  }

  private async persistSessionUpdate(
    session: AgentSessionRecord,
    patch: Partial<AgentSessionRecord>,
  ): Promise<AgentSessionRecord> {
    return this.persistSession({
      ...session,
      ...patch,
    });
  }

  private async requireSession(agentSessionId: string): Promise<AgentSessionRecord> {
    const session = await this.getPersistedSession(agentSessionId);
    if (!session) {
      throw new Error(`Agent session ${agentSessionId} was not found.`);
    }

    return session;
  }

  private async requireSessionContext(workspaceId: string): Promise<AgentSessionContext> {
    const context = await this.getWorkspaceContext(workspaceId);
    if (!context) {
      throw new Error(`Workspace ${workspaceId} was not found.`);
    }

    if (context.workspaceHost !== this.workspaceHost) {
      throw new Error(
        `AgentClient for workspace host "${this.workspaceHost}" cannot operate on workspace host "${context.workspaceHost}".`,
      );
    }

    return context;
  }

  private async persistSession(session: AgentSessionRecord): Promise<AgentSessionRecord> {
    await saveAgentSession(this.agentSessionRegistry, this.driver, session);
    const persisted = await this.getPersistedSession(session.id);
    return persisted ?? session;
  }

  private async getPersistedSession(agentSessionId: string): Promise<AgentSessionRecord | null> {
    return (await selectAgentSessionById(this.driver, agentSessionId)) ?? null;
  }

  private async getWorkspaceContext(workspaceId: string): Promise<AgentSessionContext | null> {
    const workspace = await selectWorkspaceById(this.driver, workspaceId);
    if (!workspace) {
      return null;
    }

    return {
      workspaceId,
      workspaceHost: workspace.host,
      worktreePath: workspace.worktree_path,
    };
  }

  private async withWorkerRetry(
    session: AgentSessionRecord,
    events: AgentSessionEvents,
    execute: () => Promise<void>,
  ): Promise<void> {
    const emitProviderStatus = async (status: string, detail?: string | null) => {
      await events.emit({
        kind: "agent.status.updated",
        workspaceId: session.workspace_id,
        sessionId: session.id,
        status,
        detail: detail ?? null,
      });
    };

    try {
      await execute();
      return;
    } catch (error) {
      if (!isRecoverableConnectionError(error)) {
        throw error;
      }

      await emitProviderStatus("reconnecting", "Reconnecting to agent runtime...");
      this.agentWorker.disconnectSession(session.id);

      try {
        await execute();
        await emitProviderStatus("", null);
      } catch (retryError) {
        await emitProviderStatus(
          "agent runtime unavailable",
          formatConnectionFailureStatus(retryError),
        );
        throw retryError;
      }
    }
  }

  private sessionsEqualForBootstrap(
    previous: AgentSessionRecord,
    next: AgentSessionRecord,
  ): boolean {
    return (
      previous.id === next.id &&
      previous.workspace_id === next.workspace_id &&
      previous.provider === next.provider &&
      previous.provider_session_id === next.provider_session_id &&
      previous.title === next.title &&
      previous.status === next.status &&
      previous.last_message_at === next.last_message_at &&
      previous.created_at === next.created_at &&
      previous.updated_at === next.updated_at
    );
  }
}

export function createAgentClient(dependencies: CreateAgentClientDependencies): AgentClient {
  const { observers = [], ...hostDependencies } = dependencies;
  const client = new AgentClientImpl(hostDependencies);

  for (const observer of observers) {
    client.subscribe(observer);
  }

  return client;
}
