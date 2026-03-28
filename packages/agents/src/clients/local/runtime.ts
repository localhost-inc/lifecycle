import { retry } from "../../retry";
import type { AgentApprovalResolution, AgentTurnCancelRequest, AgentTurnRequest } from "../../turn";
import type { AgentSessionConnection } from "../../worker";
import type {
  AgentRuntimeCommand,
  AgentRuntimeEvent,
  AgentRuntimeInputPart,
  AgentRuntimeRegistration,
  AgentRuntimeSnapshot,
} from "../../runtime-protocol";

export interface LocalAgentInvoke {
  <T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export interface ConnectLocalAgentRuntimeInput {
  cwd: string;
  env?: Record<string, string>;
  launchArgs: string[];
  onState: (snapshot: AgentRuntimeSnapshot) => void | Promise<void>;
  onEvent: (event: AgentRuntimeEvent) => void | Promise<void>;
  sessionId: string;
}

export interface ConnectLocalAgentRuntimeDeps {
  invoke: LocalAgentInvoke;
}

interface StartAgentRuntimeInput {
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

async function resolveAgentRuntimeDir(invoke: LocalAgentInvoke): Promise<string> {
  const root = await resolveLifecycleRoot(invoke);
  return `${root}/agents/workers`;
}

async function resolveRegistrationPath(
  invoke: LocalAgentInvoke,
  sessionId: string,
): Promise<string> {
  const dir = await resolveAgentRuntimeDir(invoke);
  return `${dir}/${sessionId}.json`;
}

async function resolveLogPath(invoke: LocalAgentInvoke, sessionId: string): Promise<string> {
  const dir = await resolveAgentRuntimeDir(invoke);
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

function isAgentRuntimeSnapshot(value: unknown): value is AgentRuntimeSnapshot {
  return (
    isRecord(value) &&
    value.kind === "worker.state" &&
    typeof value.sessionId === "string" &&
    typeof value.provider === "string" &&
    typeof value.status === "string"
  );
}

function parseRuntimeMessage(raw: string): AgentRuntimeEvent | AgentRuntimeSnapshot {
  const parsed = JSON.parse(raw) as unknown;
  if (isAgentRuntimeSnapshot(parsed)) {
    return parsed;
  }
  return parsed as AgentRuntimeEvent;
}

async function startAgentRuntime(
  invoke: LocalAgentInvoke,
  input: StartAgentRuntimeInput,
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

export async function readAgentRuntimeRegistration(
  invoke: LocalAgentInvoke,
  sessionId: string,
): Promise<AgentRuntimeRegistration | null> {
  const path = await resolveRegistrationPath(invoke, sessionId);
  const registration = await invoke<AgentRuntimeRegistration | null>("read_json_file", { path });

  runtimeLog(sessionId, "read agent runtime registration", {
    found: registration !== null,
    pid: registration?.pid ?? null,
    port: registration?.port ?? null,
    status: registration?.status ?? null,
  });

  return registration;
}

async function waitForAgentRuntimeRegistration(
  invoke: LocalAgentInvoke,
  sessionId: string,
): Promise<AgentRuntimeRegistration> {
  return retry(
    async () => {
      const registration = await readAgentRuntimeRegistration(invoke, sessionId);
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

class LocalAgentRuntimeConnection implements AgentSessionConnection {
  private connectPromise: Promise<WebSocket> | null = null;
  private initialSnapshotReceived = false;
  private socket: WebSocket | null = null;

  constructor(
    private readonly deps: ConnectLocalAgentRuntimeDeps,
    private readonly options: ConnectLocalAgentRuntimeInput,
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
    const parts: AgentRuntimeInputPart[] = [];

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

  private async sendCommand(command: AgentRuntimeCommand): Promise<void> {
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
    const existing = await readAgentRuntimeRegistration(this.deps.invoke, this.options.sessionId);
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

    await startAgentRuntime(this.deps.invoke, {
      args: this.options.launchArgs,
      sessionId: this.options.sessionId,
      ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
      ...(this.options.env ? { env: this.options.env } : {}),
    });

    return await this.connectToRegistration(
      await waitForAgentRuntimeRegistration(this.deps.invoke, this.options.sessionId),
    );
  }

  private async connectToRegistration(registration: AgentRuntimeRegistration): Promise<WebSocket> {
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
        if (isAgentRuntimeSnapshot(parsed)) {
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

export async function connectLocalAgentRuntime(
  deps: ConnectLocalAgentRuntimeDeps,
  options: ConnectLocalAgentRuntimeInput,
): Promise<AgentSessionConnection> {
  const connection = new LocalAgentRuntimeConnection(deps, options);
  await connection.connect();
  await connection.waitForInitialSnapshot();
  return connection;
}
