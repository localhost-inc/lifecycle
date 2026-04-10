import type {
  AgentEvent,
  AgentContext,
  HarnessSettings,
  AgentTurnCancelRequest,
  AgentTurnRequest,
} from "@lifecycle/agents";
import { buildDefaultHarnessSettings, buildHarnessLaunchConfig } from "@lifecycle/agents";
import { AgentMessageProjection } from "@lifecycle/agents/internal/messages";
import type { AgentHandle, AgentCallbacks } from "@lifecycle/agents/internal/handle";
import type {
  AgentStreamEvent,
  AgentStreamSnapshot,
} from "@lifecycle/agents/internal/stream-protocol";
import { AgentDirectHandle } from "./handle";
import type {
  AgentProviderId,
  AgentRecord,
  AgentApprovalResolution,
  AgentInputPart,
  AgentMessageWithParts,
  AgentProviderRequestResolution,
} from "@lifecycle/contracts";
import {
  LIFECYCLE_AGENT_ID_ENV,
  LIFECYCLE_WORKSPACE_ID_ENV,
  LIFECYCLE_WORKSPACE_PATH_ENV,
} from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { getWorkspaceRecordById } from "@lifecycle/db/queries";
import type { WorkspaceHostRegistry } from "../registry";

import { broadcastAgentEvent } from "./events";
import { spawnAgentWorker } from "./process";
import {
  insertAgentEvent,
  selectActiveAgents,
  selectAgentMessageById,
  selectAgentMessagesByAgent,
  selectAgentById,
  selectAgentsByWorkspace,
  selectNextAgentEventIndex,
  upsertAgentMessageWithParts,
  upsertAgent,
} from "./persistence";
import { readBridgeSettings, type BridgeSettingsEnvelope } from "../../auth/settings";
import { BridgeError } from "../../../lib/errors";

interface ObservedAgentMetadata {
  provider: AgentRecord["provider"];
  providerId: string | null;
  workspaceId: string;
}

const TERMINAL_AGENT_STATUSES = new Set<AgentRecord["status"]>([
  "completed",
  "failed",
  "cancelled",
]);

const SKIP_PERSIST_EVENT_KINDS = new Set<AgentEvent["kind"]>([
  "agent.message.part.delta",
  "agent.message.part.completed",
  "agent.status.updated",
]);

export interface AgentManagerInspectResult {
  agent: AgentRecord;
  messages: AgentMessageWithParts[];
}

export interface AgentManager {
  initialize(): Promise<void>;
  inspectAgent(agentId: string): Promise<AgentManagerInspectResult>;
  listAgents(workspaceId: string): Promise<AgentRecord[]>;
  resolveApproval(agentId: string, input: Omit<AgentApprovalResolution, "agentId">): Promise<void>;
  resolveProviderRequest(
    agentId: string,
    input: Omit<AgentProviderRequestResolution, "metadata">,
  ): Promise<void>;
  sendTurn(
    agentId: string,
    input: {
      turnId: string;
      input: AgentInputPart[];
    },
  ): Promise<void>;
  startAgent(input: { provider: AgentProviderId; workspaceId: string }): Promise<AgentRecord>;
  cancelTurn(agentId: string, input: Omit<AgentTurnCancelRequest, "agentId">): Promise<void>;
}

export interface AgentManagerDependencies {
  baseUrl: string;
  createAgentHandle?: (
    agent: AgentRecord,
    context: AgentContext,
    callbacks: AgentCallbacks,
  ) => AgentHandle;
  driver: SqlDriver;
  environment?: NodeJS.ProcessEnv;
  now?: () => string;
  randomId?: () => string;
  readBridgeSettings?: (environment?: NodeJS.ProcessEnv) => Promise<BridgeSettingsEnvelope>;
  spawnAgentWorker?: typeof spawnAgentWorker;
  workspaceRegistry: WorkspaceHostRegistry;
}

function fallbackRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}`;
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
    message.includes("agent") ||
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

function eventKindForPersistence(event: AgentEvent): string {
  if (event.kind === "agent.provider.event") {
    return event.eventType;
  }

  return event.kind;
}

function eventAgentId(event: AgentEvent): string | null {
  if (event.kind === "agent.created" || event.kind === "agent.updated") {
    return event.agent.id;
  }

  if ("agentId" in event) {
    return event.agentId;
  }

  return null;
}

function eventTurnId(event: AgentEvent): string | null {
  switch (event.kind) {
    case "agent.turn.started":
    case "agent.turn.completed":
    case "agent.turn.failed":
    case "agent.item.started":
    case "agent.item.updated":
    case "agent.item.completed":
    case "agent.item.delta":
    case "agent.provider.signal":
    case "agent.provider.requested":
    case "agent.provider.request.resolved":
    case "agent.provider.event":
      return event.turnId;
    case "agent.message.created":
      return event.turnId;
    default:
      return null;
  }
}

function agentsEqualForBootstrap(previous: AgentRecord, next: AgentRecord): boolean {
  return (
    previous.id === next.id &&
    previous.workspace_id === next.workspace_id &&
    previous.provider === next.provider &&
    previous.provider_id === next.provider_id &&
    previous.title === next.title &&
    previous.status === next.status &&
    previous.last_message_at === next.last_message_at &&
    previous.created_at === next.created_at &&
    previous.updated_at === next.updated_at
  );
}

class AgentManagerImpl implements AgentManager {
  private readonly now: () => string;
  private readonly randomId: () => string;
  private readonly metadataByAgentId = new Map<string, ObservedAgentMetadata>();
  private readonly observedEventIndices = new Map<string, number>();
  private readonly queuesByAgentId = new Map<string, Promise<void>>();
  private readonly agentHandles = new Map<string, AgentHandle>();
  private readonly messageProjection: AgentMessageProjection;

  constructor(private readonly deps: AgentManagerDependencies) {
    this.now = deps.now ?? defaultNow;
    this.randomId = deps.randomId ?? fallbackRandomId;
    this.messageProjection = new AgentMessageProjection({
      now: this.now,
      hasPersistedParts: async (messageId) => {
        const message = await selectAgentMessageById(this.deps.driver, messageId);
        return message?.parts.length ?? 0;
      },
      loadPersistedMessage: (messageId) => selectAgentMessageById(this.deps.driver, messageId),
    });
  }

  async initialize(): Promise<void> {
    const agents = await selectActiveAgents(this.deps.driver);

    await Promise.all(
      agents.map(async (agent) => {
        try {
          const context = await this.requireWorkspaceContext(agent.workspace_id);
          const handle = await this.spawnAgentHandle(agent, context);
          this.agentHandles.set(agent.id, handle);
        } catch (error) {
          console.error(`[agent-manager] failed to reattach ${agent.id}:`, error);
        }
      }),
    );
  }

  listAgents(workspaceId: string): Promise<AgentRecord[]> {
    return selectAgentsByWorkspace(this.deps.driver, workspaceId);
  }

  async startAgent(input: {
    provider: AgentProviderId;
    workspaceId: string;
  }): Promise<AgentRecord> {
    const context = await this.requireWorkspaceContext(input.workspaceId);
    const timestamp = this.now();
    const agent: AgentRecord = {
      id: this.randomId(),
      workspace_id: input.workspaceId,
      provider: input.provider,
      provider_id: null,
      title: "",
      status: "starting",
      last_message_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await this.recordEvent({
      kind: "agent.created",
      workspaceId: input.workspaceId,
      agent,
    });

    void this.bootstrapStartedAgent(agent, context);

    return await this.requireAgent(agent.id);
  }

  private async bootstrapStartedAgent(agent: AgentRecord, context: AgentContext): Promise<void> {
    try {
      const handle = await this.spawnAgentHandle(agent, context);
      this.agentHandles.set(agent.id, handle);

      const current = await this.requireAgent(agent.id);
      if (current.status === "starting") {
        const nextAgent = { ...current, status: "idle" as const, updated_at: this.now() };

        if (!agentsEqualForBootstrap(current, nextAgent)) {
          await this.recordEvent({
            kind: "agent.updated",
            workspaceId: nextAgent.workspace_id,
            agent: nextAgent,
          });
        }
      }
    } catch (error) {
      const failedAgent = await this.requireAgent(agent.id);
      const nextFailedAgent: AgentRecord = {
        ...failedAgent,
        status: "failed",
        updated_at: this.now(),
      };
      await this.recordEvent({
        kind: "agent.updated",
        workspaceId: nextFailedAgent.workspace_id,
        agent: nextFailedAgent,
      });
      await this.recordEvent({
        kind: "agent.status.updated",
        workspaceId: nextFailedAgent.workspace_id,
        agentId: nextFailedAgent.id,
        status: "startup failed",
        detail: error instanceof Error ? error.message : "Agent startup failed.",
      });
    }
  }

  async inspectAgent(agentId: string): Promise<AgentManagerInspectResult> {
    const agent = await this.requireAgent(agentId);
    return {
      agent,
      messages: await selectAgentMessagesByAgent(this.deps.driver, agentId),
    };
  }

  async sendTurn(
    agentId: string,
    input: {
      turnId: string;
      input: AgentInputPart[];
    },
  ): Promise<void> {
    const agent = await this.requireAgent(agentId);
    const context = await this.requireWorkspaceContext(agent.workspace_id);
    const runningAgent: AgentRecord = {
      ...agent,
      last_message_at: this.now(),
      status: "running",
      updated_at: this.now(),
    };

    await this.recordEvent({
      kind: "agent.updated",
      workspaceId: runningAgent.workspace_id,
      agent: runningAgent,
    });
    await this.recordEvent({
      kind: "agent.turn.started",
      workspaceId: runningAgent.workspace_id,
      agentId: runningAgent.id,
      turnId: input.turnId,
    });
    await this.recordEvent({
      kind: "agent.message.created",
      workspaceId: runningAgent.workspace_id,
      agentId: runningAgent.id,
      messageId: `${input.turnId}:user`,
      role: "user",
      turnId: input.turnId,
    });

    for (const [index, part] of input.input.entries()) {
      await this.recordEvent({
        kind: "agent.message.part.completed",
        workspaceId: runningAgent.workspace_id,
        agentId: runningAgent.id,
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

    const request: AgentTurnRequest = {
      agentId: runningAgent.id,
      input: input.input,
      turnId: input.turnId,
      workspaceId: runningAgent.workspace_id,
    };

    try {
      await this.withAgentRetry(runningAgent, async () => {
        const handle = await this.ensureAgentHandle(runningAgent, context);
        await handle.sendTurn(request);
      });
    } catch (error) {
      await this.recordEvent({
        kind: "agent.turn.failed",
        workspaceId: runningAgent.workspace_id,
        agentId: runningAgent.id,
        turnId: input.turnId,
        error: error instanceof Error ? error.message : "Agent turn failed.",
      });
      throw error;
    }
  }

  async cancelTurn(agentId: string, input: Omit<AgentTurnCancelRequest, "agentId">): Promise<void> {
    const agent = await this.requireAgent(agentId);
    const context = await this.requireWorkspaceContext(agent.workspace_id);

    await this.withAgentRetry(agent, async () => {
      const handle = await this.ensureAgentHandle(agent, context);
      await handle.cancelTurn({ ...input, agentId });
    });
  }

  async resolveApproval(
    agentId: string,
    input: Omit<AgentApprovalResolution, "agentId">,
  ): Promise<void> {
    const agent = await this.requireAgent(agentId);
    const context = await this.requireWorkspaceContext(agent.workspace_id);

    await this.withAgentRetry(agent, async () => {
      const handle = await this.ensureAgentHandle(agent, context);
      await handle.resolveApproval({ ...input, agentId });
    });
  }

  async resolveProviderRequest(
    agentId: string,
    input: Omit<AgentProviderRequestResolution, "metadata">,
  ): Promise<void> {
    const agent = await this.requireAgent(agentId);
    const context = await this.requireWorkspaceContext(agent.workspace_id);

    await this.withAgentRetry(agent, async () => {
      const handle = await this.ensureAgentHandle(agent, context);
      if (!handle.resolveProviderRequest) {
        throw new Error(`Agent provider ${agent.provider} does not support provider requests.`);
      }
      await handle.resolveProviderRequest(input);
    });
  }

  private async resolveLaunchHarnessSettings(): Promise<HarnessSettings> {
    const harnesses = buildDefaultHarnessSettings();
    const readSettings = this.deps.readBridgeSettings ?? readBridgeSettings;
    const envelope = await readSettings(this.deps.environment);

    return {
      ...harnesses,
      claude: {
        ...harnesses.claude,
        loginMethod: envelope.settings.providers.claude.loginMethod,
      },
    };
  }

  private createAgentCallbacks(agent: AgentRecord, context: AgentContext): AgentCallbacks {
    return {
      onState: async (snapshot) => {
        if (snapshot.agentId !== agent.id || snapshot.provider !== agent.provider) {
          return;
        }

        await this.applyRuntimeStateSnapshot(agent.id, context.workspaceId, snapshot);
      },
      onEvent: async (event) => {
        if (event.kind === "agent.ready") {
          await this.updateAgentProviderBinding(agent.id, context.workspaceId, event.providerId);
          return;
        }

        await this.emitRuntimeEvent(agent.id, context.workspaceId, agent.provider, event);
      },
    };
  }

  private async spawnAgentHandle(agent: AgentRecord, context: AgentContext): Promise<AgentHandle> {
    const callbacks = this.createAgentCallbacks(agent, context);

    if (this.deps.createAgentHandle) {
      return this.deps.createAgentHandle(agent, context, callbacks);
    }

    if (!context.workspaceRoot) {
      throw new Error(`Workspace ${agent.workspace_id} has no workspace root.`);
    }

    const harnesses = await this.resolveLaunchHarnessSettings();
    const args = buildProviderArgs(agent, context.workspaceRoot, harnesses);
    const env: Record<string, string> = {
      LIFECYCLE_BRIDGE_URL: this.deps.baseUrl,
      [LIFECYCLE_AGENT_ID_ENV]: agent.id,
      [LIFECYCLE_WORKSPACE_ID_ENV]: agent.workspace_id,
      [LIFECYCLE_WORKSPACE_PATH_ENV]: context.workspaceRoot,
    };
    if (this.deps.environment) {
      Object.assign(env, this.deps.environment);
    }

    const spawnWorker = this.deps.spawnAgentWorker ?? spawnAgentWorker;
    const child = spawnWorker({
      args,
      cwd: context.workspaceRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return new AgentDirectHandle(child, agent.id, agent.provider, callbacks);
  }

  private async ensureAgentHandle(agent: AgentRecord, context: AgentContext): Promise<AgentHandle> {
    const existing = this.agentHandles.get(agent.id);
    if (existing && (!existing.isHealthy || existing.isHealthy())) {
      return existing;
    }
    if (existing) {
      this.agentHandles.delete(agent.id);
    }

    const handle = await this.spawnAgentHandle(agent, context);
    this.agentHandles.set(agent.id, handle);
    return handle;
  }

  private async updateAgentProviderBinding(
    agentId: string,
    workspaceId: string,
    providerId: string,
  ): Promise<AgentRecord> {
    const agent = await this.requireAgent(agentId);
    if (agent.provider_id === providerId) {
      return agent;
    }

    const nextAgent: AgentRecord = {
      ...agent,
      provider_id: providerId,
    };
    await this.recordEvent({
      kind: "agent.updated",
      workspaceId,
      agent: nextAgent,
    });
    return await this.requireAgent(agentId);
  }

  private async applyRuntimeStateSnapshot(
    agentId: string,
    workspaceId: string,
    snapshot: AgentStreamSnapshot,
  ): Promise<AgentRecord> {
    const agent = await this.requireAgent(agentId);
    const nextStatus = snapshot.status === "starting" ? agent.status : snapshot.status;
    const nextProviderId =
      snapshot.providerId?.trim() && snapshot.providerId !== agent.provider_id
        ? snapshot.providerId.trim()
        : agent.provider_id;

    if (nextProviderId === agent.provider_id && nextStatus === agent.status) {
      return agent;
    }

    const nextAgent: AgentRecord = {
      ...agent,
      provider_id: nextProviderId,
      status: nextStatus,
    };
    await this.recordEvent({
      kind: "agent.updated",
      workspaceId,
      agent: nextAgent,
    });
    return await this.requireAgent(agentId);
  }

  private async emitRuntimeEvent(
    agentId: string,
    workspaceId: string,
    provider: AgentProviderId,
    event: AgentStreamEvent,
  ): Promise<void> {
    switch (event.kind) {
      case "agent.message.delta":
        await this.recordEvent({
          kind: "agent.message.part.delta",
          messageId: `${event.turnId}:assistant`,
          part: { type: "text", text: event.text },
          partId: `${event.turnId}:assistant:${event.blockId}`,
          agentId,
          workspaceId,
        });
        return;
      case "agent.thinking.delta":
        await this.recordEvent({
          kind: "agent.message.part.delta",
          messageId: `${event.turnId}:assistant`,
          part: { type: "thinking", text: event.text },
          partId: `${event.turnId}:assistant:${event.blockId}`,
          agentId,
          workspaceId,
        });
        return;
      case "agent.tool_use.start":
        await this.recordEvent({
          kind: "agent.message.part.delta",
          messageId: `${event.turnId}:assistant`,
          part: { type: "tool_call", toolCallId: event.toolUseId, toolName: event.toolName },
          partId: `${event.turnId}:assistant:tool:${event.toolUseId}`,
          agentId,
          workspaceId,
        });
        return;
      case "agent.tool_use.input":
        await this.recordEvent({
          kind: "agent.message.part.completed",
          messageId: `${event.turnId}:assistant`,
          part: {
            type: "tool_call",
            toolCallId: event.toolUseId,
            toolName: event.toolName,
            inputJson: event.inputJson,
          },
          partId: `${event.turnId}:assistant:tool:${event.toolUseId}`,
          agentId,
          workspaceId,
        });
        return;
      case "agent.tool_progress":
        await this.recordEvent({
          kind: "agent.message.part.delta",
          messageId: `${event.turnId}:assistant`,
          part: {
            type: "status",
            text: `${event.toolName} (${Math.round(event.elapsedTimeSeconds)}s)`,
          },
          partId: `${event.turnId}:assistant:tool:${event.toolUseId}:progress`,
          agentId,
          workspaceId,
        });
        return;
      case "agent.item.completed":
      case "agent.item.started":
      case "agent.item.updated":
        await this.recordEvent({
          kind: event.kind,
          item: event.item,
          agentId,
          turnId: event.turnId,
          workspaceId,
        });
        switch (event.item.type) {
          case "agent_message":
          case "reasoning":
          case "image_view":
          case "image_generation":
          case "review_mode":
          case "context_compaction":
            return;
          case "tool_call":
            await this.recordEvent({
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
              agentId,
              workspaceId,
            });
            return;
          case "command_execution":
            await this.recordEvent({
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
              agentId,
              workspaceId,
            });
            return;
          case "file_change":
            await this.recordEvent({
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
              agentId,
              workspaceId,
            });
            return;
          case "error":
            await this.recordEvent({
              kind: "agent.tool_call.updated",
              agentId,
              toolCall: {
                errorText: event.item.message,
                id: event.item.id,
                inputJson: { message: event.item.message },
                outputJson: null,
                agentId,
                status: "failed",
                toolName: "error",
              },
              workspaceId,
            });
            return;
        }
        return;
      case "agent.item.delta":
        await this.recordEvent({
          kind: "agent.item.delta",
          delta: event.delta,
          agentId,
          turnId: event.turnId,
          workspaceId,
        });
        return;
      case "agent.approval.requested":
        await this.recordEvent({
          kind: "agent.approval.requested",
          agentId,
          workspaceId,
          approval: {
            ...event.approval,
            agentId,
          },
        });
        return;
      case "agent.approval.resolved":
        await this.recordEvent({
          kind: "agent.approval.resolved",
          agentId,
          workspaceId,
          resolution: {
            ...event.resolution,
            agentId,
          },
        });
        return;
      case "agent.provider.requested":
        await this.recordEvent({
          kind: "agent.provider.requested",
          agentId,
          workspaceId,
          turnId: event.turnId ?? null,
          request: event.request,
        });
        return;
      case "agent.provider.request.resolved":
        await this.recordEvent({
          kind: "agent.provider.request.resolved",
          agentId,
          workspaceId,
          turnId: event.turnId ?? null,
          resolution: event.resolution,
        });
        return;
      case "agent.status":
        await this.recordEvent({
          kind: "agent.status.updated",
          agentId,
          workspaceId,
          status: event.status,
          detail: event.detail ?? null,
        });
        return;
      case "agent.provider.signal":
        await this.recordEvent({
          kind: "agent.provider.signal",
          agentId,
          workspaceId,
          turnId: event.turnId ?? null,
          signal: event.signal,
        });
        return;
      case "agent.raw_event":
        await this.recordEvent({
          kind: "agent.provider.event",
          agentId,
          workspaceId,
          turnId: event.turnId ?? null,
          eventType: event.eventType,
          payload: event.payload,
        });
        return;
      case "agent.turn.completed":
        await this.recordEvent({
          kind: "agent.turn.completed",
          agentId,
          turnId: event.turnId,
          workspaceId,
          usage: event.usage,
          costUsd: event.costUsd,
        });
        return;
      case "agent.turn.failed":
        await this.recordEvent({
          kind: "agent.turn.failed",
          error: event.error,
          agentId,
          turnId: event.turnId,
          workspaceId,
        });
        return;
      case "agent.auth_status":
        await this.recordEvent({
          kind: "agent.auth.updated",
          provider,
          authenticated: !event.isAuthenticating && !event.error,
          mode: event.isAuthenticating ? "authenticating" : event.error ? "error" : "ready",
          agentId,
          workspaceId,
        });
        return;
      case "agent.title_generated": {
        const agent = await this.requireAgent(agentId);
        if (agent.title.trim().length > 0) {
          return;
        }

        await this.recordEvent({
          kind: "agent.updated",
          workspaceId,
          agent: {
            ...agent,
            title: event.title,
            updated_at: this.now(),
          },
        });
        return;
      }
      case "agent.ready":
        return;
    }
  }

  private async withAgentRetry(agent: AgentRecord, execute: () => Promise<void>): Promise<void> {
    const emitProviderStatus = async (status: string, detail?: string | null) => {
      await this.recordEvent({
        kind: "agent.status.updated",
        workspaceId: agent.workspace_id,
        agentId: agent.id,
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

      await emitProviderStatus("reconnecting", "Reconnecting to agent...");
      this.agentHandles.delete(agent.id);

      try {
        await execute();
        await emitProviderStatus("", null);
      } catch (retryError) {
        await emitProviderStatus("agent unavailable", formatConnectionFailureStatus(retryError));
        throw retryError;
      }
    }
  }

  private async recordEvent(event: AgentEvent): Promise<void> {
    const agentId = eventAgentId(event);
    const execute = async () => {
      const derivedEvents = await this.deriveEvents(event);
      for (const nextEvent of derivedEvents) {
        await this.persistAndBroadcastEvent(nextEvent);
      }
    };

    if (!agentId) {
      await execute();
      return;
    }

    await this.enqueueAgentTask(agentId, execute);
  }

  private async deriveEvents(event: AgentEvent): Promise<AgentEvent[]> {
    switch (event.kind) {
      case "agent.turn.completed": {
        const agent = await this.requireAgent(event.agentId);
        return [
          {
            kind: "agent.updated",
            workspaceId: agent.workspace_id,
            agent: {
              ...agent,
              last_message_at: this.now(),
              status: "idle",
              updated_at: this.now(),
            },
          },
          event,
        ];
      }
      case "agent.turn.failed": {
        const agent = await this.requireAgent(event.agentId);
        return [
          {
            kind: "agent.updated",
            workspaceId: agent.workspace_id,
            agent: {
              ...agent,
              status: "failed",
              updated_at: this.now(),
            },
          },
          event,
        ];
      }
      case "agent.approval.requested": {
        const agent = await this.requireAgent(event.agentId);
        return [
          {
            kind: "agent.updated",
            workspaceId: agent.workspace_id,
            agent: {
              ...agent,
              status: event.approval.kind === "question" ? "waiting_input" : "waiting_approval",
              updated_at: this.now(),
            },
          },
          event,
        ];
      }
      case "agent.approval.resolved": {
        const agent = await this.requireAgent(event.agentId);
        return [
          {
            kind: "agent.updated",
            workspaceId: agent.workspace_id,
            agent: {
              ...agent,
              status: "running",
              updated_at: this.now(),
            },
          },
          event,
        ];
      }
      default:
        return [event];
    }
  }

  private async persistAndBroadcastEvent(event: AgentEvent): Promise<void> {
    if (event.kind === "agent.created" || event.kind === "agent.updated") {
      await upsertAgent(this.deps.driver, event.agent);
      this.metadataByAgentId.set(event.agent.id, {
        workspaceId: event.workspaceId,
        provider: event.agent.provider,
        providerId: event.agent.provider_id,
      });
    }

    await this.persistObservedEvent(event);

    const projectedMessage = await this.messageProjection.processEvent(event);
    if (projectedMessage) {
      await upsertAgentMessageWithParts(this.deps.driver, projectedMessage);
    }

    broadcastAgentEvent(event, {
      occurredAt: this.now(),
      projectedMessage,
    });

    if (event.kind === "agent.updated" && TERMINAL_AGENT_STATUSES.has(event.agent.status)) {
      this.agentHandles.delete(event.agent.id);
      this.messageProjection.clearAgent(event.agent.id);
      this.metadataByAgentId.delete(event.agent.id);
      this.observedEventIndices.delete(event.agent.id);
    }
  }

  private async persistObservedEvent(event: AgentEvent): Promise<void> {
    const agentId = eventAgentId(event);
    if (!agentId || SKIP_PERSIST_EVENT_KINDS.has(event.kind)) {
      return;
    }

    const metadata = await this.getObservedAgentMetadata(agentId);
    if (!metadata) {
      return;
    }

    const eventIndex = await this.nextObservedEventIndex(agentId);
    await insertAgentEvent(this.deps.driver, {
      id: `${agentId}:event:${String(eventIndex).padStart(6, "0")}`,
      agent_id: agentId,
      workspace_id: metadata.workspaceId,
      provider: metadata.provider,
      provider_id: metadata.providerId,
      turn_id: eventTurnId(event),
      event_index: eventIndex,
      event_kind: eventKindForPersistence(event),
      payload: JSON.stringify(event),
      created_at: this.now(),
    });
  }

  private async getObservedAgentMetadata(agentId: string): Promise<ObservedAgentMetadata | null> {
    const cached = this.metadataByAgentId.get(agentId);
    if (cached) {
      return cached;
    }

    const agent = await selectAgentById(this.deps.driver, agentId);
    if (!agent) {
      return null;
    }

    const metadata = {
      workspaceId: agent.workspace_id,
      provider: agent.provider,
      providerId: agent.provider_id,
    };
    this.metadataByAgentId.set(agentId, metadata);
    return metadata;
  }

  private async nextObservedEventIndex(agentId: string): Promise<number> {
    const cached = this.observedEventIndices.get(agentId);
    if (typeof cached === "number") {
      const next = cached + 1;
      this.observedEventIndices.set(agentId, next);
      return next;
    }

    const next = await selectNextAgentEventIndex(this.deps.driver, agentId);
    this.observedEventIndices.set(agentId, next);
    return next;
  }

  private async enqueueAgentTask(agentId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queuesByAgentId.get(agentId) ?? Promise.resolve();
    const next = previous
      .catch((error) => {
        console.error("[agent-manager] previous queued event failed for agent", agentId, error);
      })
      .then(task);
    this.queuesByAgentId.set(agentId, next);

    await next.finally(() => {
      if (this.queuesByAgentId.get(agentId) === next) {
        this.queuesByAgentId.delete(agentId);
      }
    });
  }

  private async requireAgent(agentId: string): Promise<AgentRecord> {
    const agent = await selectAgentById(this.deps.driver, agentId);
    if (!agent) {
      throw new BridgeError({
        code: "agent_not_found",
        message: `Could not resolve agent "${agentId}".`,
        status: 404,
      });
    }

    return agent;
  }

  private async requireWorkspaceContext(workspaceId: string): Promise<AgentContext> {
    const workspace = await getWorkspaceRecordById(this.deps.driver, workspaceId);
    if (!workspace) {
      throw new BridgeError({
        code: "workspace_not_found",
        message: `Could not resolve workspace "${workspaceId}".`,
        status: 404,
      });
    }

    return {
      workspaceHost: workspace.host,
      workspaceId,
      workspaceRoot: workspace.workspace_root,
    };
  }
}

export function createAgentManager(deps: AgentManagerDependencies): AgentManager {
  return new AgentManagerImpl(deps);
}

function normalizeClaudePermissionMode(permissionMode: string): string {
  return permissionMode === "auto" ? "default" : permissionMode;
}

function buildProviderArgs(
  agent: AgentRecord,
  workspaceRoot: string,
  harnesses: HarnessSettings,
): string[] {
  const launchConfig = buildHarnessLaunchConfig(agent.provider, harnesses);
  const args = ["agent", agent.provider, "--workspace-path", workspaceRoot];

  if (launchConfig.model?.trim()) {
    args.push("--model", launchConfig.model.trim());
  }
  if (agent.provider_id?.trim()) {
    args.push("--provider-id", agent.provider_id.trim());
  }

  if (launchConfig.provider === "claude") {
    args.push(
      "--permission-mode",
      normalizeClaudePermissionMode(launchConfig.permissionMode),
      "--login-method",
      launchConfig.loginMethod,
    );
    if (launchConfig.dangerousSkipPermissions) {
      args.push("--dangerous-skip-permissions");
    }
    if (launchConfig.effort !== "default") {
      args.push("--effort", launchConfig.effort);
    }
  } else {
    args.push(
      "--approval-policy",
      launchConfig.approvalPolicy,
      "--sandbox-mode",
      launchConfig.sandboxMode,
    );
    if (launchConfig.dangerousBypass) {
      args.push("--dangerous-bypass");
    }
    if (launchConfig.reasoningEffort !== "default") {
      args.push("--model-reasoning-effort", launchConfig.reasoningEffort);
    }
  }

  return args;
}
