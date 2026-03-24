import type {
  AgentApprovalResolution,
  AgentTurnCancelRequest,
  AgentTurnRequest,
  AgentWorker,
  AgentWorkerCommand,
  AgentWorkerEvent,
  DetachedAgentHostRegistration,
  DetachedAgentHostSnapshot,
} from "@lifecycle/agents";
import { invokeTauri } from "@/lib/tauri-error";

interface StartDetachedAgentHostInput {
  args: string[];
  cwd?: string;
  sessionId: string;
}

interface DetachedWorkerClientOptions {
  cwd: string;
  launchArgs: string[];
  onState: (state: DetachedAgentHostSnapshot) => void | Promise<void>;
  onWorkerEvent: (event: AgentWorkerEvent) => void | Promise<void>;
  sessionId: string;
}

function clientLog(sessionId: string, message: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[agent-client][${timestamp}][${sessionId}] ${message}${suffix}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isDetachedAgentHostSnapshot(value: unknown): value is DetachedAgentHostSnapshot {
  return (
    isRecord(value) &&
    value.kind === "worker.state" &&
    typeof value.sessionId === "string" &&
    typeof value.provider === "string" &&
    typeof value.status === "string"
  );
}

function parseHostMessage(raw: string): AgentWorkerEvent | DetachedAgentHostSnapshot {
  const parsed = JSON.parse(raw) as unknown;
  if (isDetachedAgentHostSnapshot(parsed)) {
    return parsed;
  }
  return parsed as AgentWorkerEvent;
}

async function startDetachedAgentHost(input: StartDetachedAgentHostInput): Promise<void> {
  clientLog(input.sessionId, "starting detached agent host", {
    cwd: input.cwd ?? null,
    argCount: input.args.length,
  });
  await invokeTauri("start_detached_agent_host", {
    request: {
      args: input.args,
      cwd: input.cwd ?? null,
      sessionId: input.sessionId,
    },
  });
}

export async function readDetachedAgentHostRegistration(
  sessionId: string,
): Promise<DetachedAgentHostRegistration | null> {
  const registration = await invokeTauri<DetachedAgentHostRegistration | null>("read_agent_host_registration", {
    request: {
      sessionId,
    },
  });
  clientLog(sessionId, "read detached host registration", {
    found: registration !== null,
    pid: registration?.pid ?? null,
    port: registration?.port ?? null,
    status: registration?.status ?? null,
  });
  return registration;
}

async function waitForDetachedAgentHostRegistration(
  sessionId: string,
): Promise<DetachedAgentHostRegistration> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const registration = await readDetachedAgentHostRegistration(sessionId);
    if (registration) {
      clientLog(sessionId, "registration became available", {
        attempt: attempt + 1,
        port: registration.port,
      });
      return registration;
    }
    await sleep(100);
  }

  throw new Error(`Detached agent host ${sessionId} did not publish registration in time.`);
}

class DetachedWorkerClient implements AgentWorker {
  private connectPromise: Promise<WebSocket> | null = null;
  private initialSnapshotReceived = false;
  private socket: WebSocket | null = null;

  constructor(private readonly options: DetachedWorkerClientOptions) {}

  async connect(): Promise<void> {
    clientLog(this.options.sessionId, "connect requested");
    await this.ensureSocket(true);
  }

  async waitForInitialSnapshot(): Promise<void> {
    for (let attempt = 0; attempt < 5 && !this.initialSnapshotReceived; attempt += 1) {
      await sleep(25);
    }
  }

  async sendTurn(turn: AgentTurnRequest): Promise<void> {
    const prompt = turn.input
      .flatMap((part) => (part.type === "text" ? [part.text.trim()] : []))
      .filter((part) => part.length > 0)
      .join("\n\n");
    if (prompt.length === 0) {
      throw new Error("Agent prompt cannot be empty.");
    }

    await this.sendCommand({
      kind: "worker.send_turn",
      input: prompt,
      turnId: turn.turnId,
    });
  }

  async cancelTurn(request: AgentTurnCancelRequest): Promise<void> {
    await this.sendCommand({
      kind: "worker.cancel_turn",
      turnId: request.turnId ?? null,
    });
  }

  async resolveApproval(request: AgentApprovalResolution): Promise<void> {
    await this.sendCommand({
      kind: "worker.resolve_approval",
      approvalId: request.approvalId,
      decision: request.decision,
      response: request.response ?? null,
    });
  }

  private async sendCommand(command: AgentWorkerCommand): Promise<void> {
    clientLog(this.options.sessionId, "sending command", {
      commandKind: command.kind,
      turnId: "turnId" in command ? command.turnId ?? null : null,
      approvalId: "approvalId" in command ? command.approvalId : null,
    });
    const socket = await this.ensureSocket(false);
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error("Detached agent host connection is not open.");
    }

    socket.send(JSON.stringify(command));
  }

  private async ensureSocket(forceStart: boolean): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      clientLog(this.options.sessionId, "reusing open websocket");
      return this.socket;
    }

    if (this.connectPromise) {
      clientLog(this.options.sessionId, "awaiting in-flight websocket connection");
      return await this.connectPromise;
    }

    const promise = this.openSocket(forceStart);
    this.connectPromise = promise;
    try {
      const socket = await promise;
      this.socket = socket;
      return socket;
    } finally {
      this.connectPromise = null;
    }
  }

  private async openSocket(forceStart: boolean): Promise<WebSocket> {
    const existing = await readDetachedAgentHostRegistration(this.options.sessionId);
    if (existing) {
      try {
        clientLog(this.options.sessionId, "connecting to existing detached host", {
          pid: existing.pid,
          port: existing.port,
          status: existing.status,
        });
        return await this.connectToRegistration(existing);
      } catch (error) {
        clientLog(this.options.sessionId, "existing detached host connect failed", {
          error: error instanceof Error ? error.message : String(error),
          pid: existing.pid,
          port: existing.port,
        });
        // Fall through and relaunch the host below.
      }
    }

    if (!forceStart && !existing) {
      throw new Error(`Detached agent host ${this.options.sessionId} is unavailable.`);
    }

    await startDetachedAgentHost({
      args: this.options.launchArgs,
      cwd: this.options.cwd,
      sessionId: this.options.sessionId,
    });
    return await this.connectToRegistration(
      await waitForDetachedAgentHostRegistration(this.options.sessionId),
    );
  }

  private async connectToRegistration(
    registration: DetachedAgentHostRegistration,
  ): Promise<WebSocket> {
    return await new Promise<WebSocket>((resolve, reject) => {
      clientLog(this.options.sessionId, "opening websocket", {
        pid: registration.pid,
        port: registration.port,
        status: registration.status,
      });
      const socket = new WebSocket(
        `ws://127.0.0.1:${registration.port}/?token=${encodeURIComponent(registration.token)}`,
      );
      let settled = false;

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        callback();
      };

      socket.onopen = () => {
        clientLog(this.options.sessionId, "websocket open", {
          pid: registration.pid,
          port: registration.port,
        });
        settle(() => resolve(socket));
      };
      socket.onerror = () => {
        clientLog(this.options.sessionId, "websocket error", {
          pid: registration.pid,
          port: registration.port,
        });
        settle(() => reject(new Error(`Failed to connect to detached agent host ${registration.sessionId}.`)));
      };
      socket.onclose = () => {
        clientLog(this.options.sessionId, "websocket closed", {
          pid: registration.pid,
          port: registration.port,
          settled,
        });
        if (!settled) {
          settle(() =>
            reject(new Error(`Detached agent host ${registration.sessionId} closed before connecting.`)),
          );
        }
        if (this.socket === socket) {
          this.socket = null;
        }
      };
      socket.onmessage = (message) => {
        const payload =
          typeof message.data === "string"
            ? message.data
            : message.data instanceof Blob
              ? null
              : String(message.data);
        if (!payload) {
          return;
        }

        const parsed = parseHostMessage(payload);
        if (isDetachedAgentHostSnapshot(parsed)) {
          clientLog(this.options.sessionId, "received state snapshot", {
            provider: parsed.provider,
            providerSessionId: parsed.providerSessionId,
            status: parsed.status,
            activeTurnId: parsed.activeTurnId,
            pendingApprovalId: parsed.pendingApproval?.id ?? null,
          });
          this.initialSnapshotReceived = true;
          void this.options.onState(parsed);
          return;
        }
        clientLog(this.options.sessionId, "received worker event", {
          eventKind: parsed.kind,
          turnId: "turnId" in parsed ? parsed.turnId : null,
        });
        void this.options.onWorkerEvent(parsed);
      };
    });
  }
}

export async function createDetachedWorkerClient(
  options: DetachedWorkerClientOptions,
): Promise<AgentWorker> {
  const client = new DetachedWorkerClient(options);
  await client.connect();
  await client.waitForInitialSnapshot();
  return client;
}
