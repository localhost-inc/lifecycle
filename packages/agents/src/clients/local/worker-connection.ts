import { retry } from "../../retry";
import type { AgentApprovalResolution, AgentTurnCancelRequest, AgentTurnRequest } from "../../turn";
import type { AgentSessionConnection } from "../../worker";
import type {
  AgentWorkerCommand,
  AgentWorkerEvent,
  AgentWorkerInputPart,
  AgentWorkerRegistration,
  AgentWorkerSnapshot,
} from "../../worker/protocol";

export interface LocalAgentInvoke {
  <T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export interface ConnectLocalAgentWorkerInput {
  cwd: string;
  env?: Record<string, string>;
  launchArgs: string[];
  onState: (snapshot: AgentWorkerSnapshot) => void | Promise<void>;
  onEvent: (event: AgentWorkerEvent) => void | Promise<void>;
  sessionId: string;
}

export interface ConnectLocalAgentWorkerDeps {
  invoke: LocalAgentInvoke;
}

interface StartAgentWorkerInput {
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  sessionId: string;
}

let cachedLifecycleRoot: string | null = null;

async function resolveLifecycleRoot(invoke: LocalAgentInvoke): Promise<string> {
  if (cachedLifecycleRoot) {
    return cachedLifecycleRoot;
  }

  cachedLifecycleRoot = await invoke<string>("resolve_lifecycle_root_path");
  return cachedLifecycleRoot;
}

async function resolveAgentWorkerDir(invoke: LocalAgentInvoke): Promise<string> {
  const root = await resolveLifecycleRoot(invoke);
  return `${root}/agents/workers`;
}

async function resolveRegistrationPath(
  invoke: LocalAgentInvoke,
  sessionId: string,
): Promise<string> {
  const dir = await resolveAgentWorkerDir(invoke);
  return `${dir}/${sessionId}.json`;
}

async function resolveLogPath(invoke: LocalAgentInvoke, sessionId: string): Promise<string> {
  const dir = await resolveAgentWorkerDir(invoke);
  return `${dir}/logs/${sessionId}.log`;
}

function runtimeLog(sessionId: string, message: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[agent-runtime][${timestamp}][${sessionId}] ${message}${suffix}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isAgentWorkerSnapshot(value: unknown): value is AgentWorkerSnapshot {
  return (
    isRecord(value) &&
    value.kind === "worker.state" &&
    typeof value.sessionId === "string" &&
    typeof value.provider === "string" &&
    typeof value.status === "string"
  );
}

function parseRuntimeMessage(raw: string): AgentWorkerEvent | AgentWorkerSnapshot {
  const parsed = JSON.parse(raw) as unknown;
  if (isAgentWorkerSnapshot(parsed)) {
    return parsed;
  }
  return parsed as AgentWorkerEvent;
}

async function startAgentWorker(
  invoke: LocalAgentInvoke,
  input: StartAgentWorkerInput,
): Promise<void> {
  const registrationPath = await resolveRegistrationPath(invoke, input.sessionId);
  const logPath = await resolveLogPath(invoke, input.sessionId);

  runtimeLog(input.sessionId, "starting agent runtime", {
    cwd: input.cwd ?? null,
    argCount: input.args.length,
  });

  await invoke("spawn_cli_process", {
    request: {
      args: ["agent", "worker", "start", ...input.args, "--registration-path", registrationPath],
      cwd: input.cwd ?? null,
      env: input.env ?? {},
      logPath,
    },
  });
}

export async function readAgentWorkerRegistration(
  invoke: LocalAgentInvoke,
  sessionId: string,
): Promise<AgentWorkerRegistration | null> {
  const path = await resolveRegistrationPath(invoke, sessionId);
  const registration = await invoke<AgentWorkerRegistration | null>("read_json_file", { path });

  runtimeLog(sessionId, "read agent runtime registration", {
    found: registration !== null,
    pid: registration?.pid ?? null,
    port: registration?.port ?? null,
    status: registration?.status ?? null,
  });

  return registration;
}

async function waitForAgentWorkerRegistration(
  invoke: LocalAgentInvoke,
  sessionId: string,
): Promise<AgentWorkerRegistration> {
  return retry(
    async () => {
      const registration = await readAgentWorkerRegistration(invoke, sessionId);
      if (!registration) {
        throw new Error(`Agent runtime ${sessionId} has not registered yet.`);
      }

      runtimeLog(sessionId, "registration became available", { port: registration.port });
      return registration;
    },
    {
      attempts: 40,
      onRetry: () => sleep(100),
    },
  );
}

class LocalAgentWorkerConnection implements AgentSessionConnection {
  private connectPromise: Promise<WebSocket> | null = null;
  private initialSnapshotReceived = false;
  private socket: WebSocket | null = null;

  constructor(
    private readonly deps: ConnectLocalAgentWorkerDeps,
    private readonly options: ConnectLocalAgentWorkerInput,
  ) {}

  async connect(): Promise<void> {
    runtimeLog(this.options.sessionId, "connect requested");
    await this.ensureSocket(true);
  }

  isHealthy(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async waitForInitialSnapshot(): Promise<void> {
    for (let attempt = 0; attempt < 5 && !this.initialSnapshotReceived; attempt += 1) {
      await sleep(25);
    }
  }

  async sendTurn(turn: AgentTurnRequest): Promise<void> {
    const parts: AgentWorkerInputPart[] = [];

    for (const part of turn.input) {
      if (part.type === "text") {
        const trimmed = part.text.trim();
        if (trimmed.length > 0) {
          parts.push({ type: "text", text: trimmed });
        }
      } else if (part.type === "image") {
        parts.push({ type: "image", mediaType: part.mediaType, base64Data: part.base64Data });
      }
    }

    if (parts.length === 0) {
      throw new Error("Agent prompt cannot be empty.");
    }

    await this.sendCommand({
      kind: "worker.send_turn",
      input: parts,
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
    runtimeLog(this.options.sessionId, "sending command", {
      commandKind: command.kind,
      turnId: "turnId" in command ? (command.turnId ?? null) : null,
      approvalId: "approvalId" in command ? command.approvalId : null,
    });

    const payload = JSON.stringify(command);
    let forceReconnect = false;

    await retry(
      async () => {
        const socket = await this.ensureSocket(forceReconnect);
        if (socket.readyState !== WebSocket.OPEN) {
          throw new Error("Agent runtime connection is not open.");
        }
        socket.send(payload);
      },
      {
        attempts: 2,
        onRetry: (error) => {
          forceReconnect = true;
          runtimeLog(this.options.sessionId, "send failed, retrying with fresh connection", {
            error: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  }

  private async ensureSocket(forceStart: boolean): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      runtimeLog(this.options.sessionId, "reusing open websocket");
      return this.socket;
    }

    if (this.connectPromise) {
      runtimeLog(this.options.sessionId, "awaiting in-flight websocket connection");
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
    const existing = await readAgentWorkerRegistration(this.deps.invoke, this.options.sessionId);
    if (existing) {
      try {
        runtimeLog(this.options.sessionId, "connecting to existing agent runtime", {
          pid: existing.pid,
          port: existing.port,
          status: existing.status,
        });
        return await this.connectToRegistration(existing);
      } catch (error) {
        runtimeLog(this.options.sessionId, "existing agent runtime connect failed", {
          error: error instanceof Error ? error.message : String(error),
          pid: existing.pid,
          port: existing.port,
        });
      }
    }

    if (!forceStart && !existing) {
      throw new Error(`Agent runtime ${this.options.sessionId} is unavailable.`);
    }

    await startAgentWorker(this.deps.invoke, {
      args: this.options.launchArgs,
      sessionId: this.options.sessionId,
      ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
      ...(this.options.env ? { env: this.options.env } : {}),
    });

    return await this.connectToRegistration(
      await waitForAgentWorkerRegistration(this.deps.invoke, this.options.sessionId),
    );
  }

  private async connectToRegistration(registration: AgentWorkerRegistration): Promise<WebSocket> {
    return await new Promise<WebSocket>((resolve, reject) => {
      runtimeLog(this.options.sessionId, "opening websocket", {
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
        runtimeLog(this.options.sessionId, "websocket open", {
          pid: registration.pid,
          port: registration.port,
        });
        settle(() => resolve(socket));
      };

      socket.onerror = () => {
        runtimeLog(this.options.sessionId, "websocket error", {
          pid: registration.pid,
          port: registration.port,
        });
        settle(() =>
          reject(new Error(`Failed to connect to agent runtime ${registration.sessionId}.`)),
        );
      };

      socket.onclose = () => {
        runtimeLog(this.options.sessionId, "websocket closed", {
          pid: registration.pid,
          port: registration.port,
          settled,
        });
        if (!settled) {
          settle(() =>
            reject(new Error(`Agent runtime ${registration.sessionId} closed before connecting.`)),
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

        const parsed = parseRuntimeMessage(payload);
        if (isAgentWorkerSnapshot(parsed)) {
          runtimeLog(this.options.sessionId, "received state snapshot", {
            provider: parsed.provider,
            providerSessionId: parsed.providerSessionId,
            status: parsed.status,
            activeTurnId: parsed.activeTurnId,
            pendingApprovalId: parsed.pendingApproval?.id ?? null,
          });
          this.initialSnapshotReceived = true;
          void Promise.resolve(this.options.onState(parsed)).catch((error) => {
            runtimeLog(this.options.sessionId, "onState handler failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          });
          return;
        }

        runtimeLog(this.options.sessionId, "received runtime event", {
          eventKind: parsed.kind,
          turnId: "turnId" in parsed ? parsed.turnId : null,
        });
        void Promise.resolve(this.options.onEvent(parsed)).catch((error) => {
          runtimeLog(this.options.sessionId, "onEvent handler failed", {
            eventKind: parsed.kind,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      };
    });
  }
}

export async function connectLocalAgentWorker(
  deps: ConnectLocalAgentWorkerDeps,
  options: ConnectLocalAgentWorkerInput,
): Promise<AgentSessionConnection> {
  const connection = new LocalAgentWorkerConnection(deps, options);
  await connection.connect();
  await connection.waitForInitialSnapshot();
  return connection;
}
