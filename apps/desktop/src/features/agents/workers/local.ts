import { retry } from "@lifecycle/agents";
import type {
  AgentApprovalResolution,
  AgentEventObserver,
  AgentSessionContext,
  AgentSessionEvents,
  AgentTurnCancelRequest,
  AgentTurnRequest,
  AgentWorker as IAgentWorker,
  AgentWorkerCommand,
  AgentWorkerEvent,
  AgentWorkerInputPart,
  AgentWorkerRegistration,
  AgentWorkerSnapshot,
} from "@lifecycle/agents";
import type { AgentSessionRecord } from "@lifecycle/contracts";
import { parseSettingsJson } from "@/features/settings/state/settings-state";
import { readAppSettings } from "@/lib/config";
import { invokeTauri } from "@/lib/tauri-error";
import type { CreateWorkerOptions, CreateWorkerResult } from "./index";

interface StartAgentWorkerInput {
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Path resolution — all agent-specific path knowledge lives here
// ---------------------------------------------------------------------------

let cachedLifecycleRoot: string | null = null;

async function resolveLifecycleRoot(): Promise<string> {
  if (cachedLifecycleRoot) {
    return cachedLifecycleRoot;
  }
  cachedLifecycleRoot = await invokeTauri<string>("resolve_lifecycle_root_path");
  return cachedLifecycleRoot;
}

async function resolveAgentWorkerDir(): Promise<string> {
  const root = await resolveLifecycleRoot();
  return `${root}/agents/workers`;
}

async function resolveRegistrationPath(sessionId: string): Promise<string> {
  const dir = await resolveAgentWorkerDir();
  return `${dir}/${sessionId}.json`;
}

async function resolveLogPath(sessionId: string): Promise<string> {
  const dir = await resolveAgentWorkerDir();
  return `${dir}/logs/${sessionId}.log`;
}

interface AgentWorkerOptions {
  cwd: string;
  env?: Record<string, string>;
  launchArgs: string[];
  onState: (state: AgentWorkerSnapshot) => void | Promise<void>;
  onWorkerEvent: (event: AgentWorkerEvent) => void | Promise<void>;
  sessionId: string;
}

function workerLog(sessionId: string, message: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.info(`[agent-worker][${timestamp}][${sessionId}] ${message}${suffix}`);
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

function parseWorkerMessage(raw: string): AgentWorkerEvent | AgentWorkerSnapshot {
  const parsed = JSON.parse(raw) as unknown;
  if (isAgentWorkerSnapshot(parsed)) {
    return parsed;
  }
  return parsed as AgentWorkerEvent;
}

async function startAgentWorker(input: StartAgentWorkerInput): Promise<void> {
  const registrationPath = await resolveRegistrationPath(input.sessionId);
  const logPath = await resolveLogPath(input.sessionId);

  workerLog(input.sessionId, "starting agent worker", {
    cwd: input.cwd ?? null,
    argCount: input.args.length,
  });

  await invokeTauri("spawn_cli_process", {
    request: {
      args: [
        "agent",
        "worker",
        "start",
        ...input.args,
        "--registration-path",
        registrationPath,
      ],
      cwd: input.cwd ?? null,
      env: input.env ?? {},
      logPath,
    },
  });
}

export async function readAgentWorkerRegistration(
  sessionId: string,
): Promise<AgentWorkerRegistration | null> {
  const path = await resolveRegistrationPath(sessionId);
  const registration = await invokeTauri<AgentWorkerRegistration | null>("read_json_file", {
    path,
  });
  workerLog(sessionId, "read agent worker registration", {
    found: registration !== null,
    pid: registration?.pid ?? null,
    port: registration?.port ?? null,
    status: registration?.status ?? null,
  });
  return registration;
}

async function waitForAgentWorkerRegistration(
  sessionId: string,
): Promise<AgentWorkerRegistration> {
  return retry(
    async () => {
      const registration = await readAgentWorkerRegistration(sessionId);
      if (!registration) {
        throw new Error(`Agent worker ${sessionId} has not registered yet.`);
      }
      workerLog(sessionId, "registration became available", { port: registration.port });
      return registration;
    },
    {
      attempts: 40,
      onRetry: () => sleep(100),
    },
  );
}

class AgentWorker implements IAgentWorker {
  private connectPromise: Promise<WebSocket> | null = null;
  private initialSnapshotReceived = false;
  private socket: WebSocket | null = null;

  constructor(private readonly options: AgentWorkerOptions) {}

  async connect(): Promise<void> {
    workerLog(this.options.sessionId, "connect requested");
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
    workerLog(this.options.sessionId, "sending command", {
      commandKind: command.kind,
      turnId: "turnId" in command ? command.turnId ?? null : null,
      approvalId: "approvalId" in command ? command.approvalId : null,
    });

    const payload = JSON.stringify(command);
    let forceReconnect = false;

    await retry(
      async () => {
        const socket = await this.ensureSocket(forceReconnect);
        if (socket.readyState !== WebSocket.OPEN) {
          throw new Error("Agent worker connection is not open.");
        }
        socket.send(payload);
      },
      {
        attempts: 2,
        onRetry: (error) => {
          forceReconnect = true;
          workerLog(this.options.sessionId, "send failed, retrying with fresh connection", {
            error: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  }

  private async ensureSocket(forceStart: boolean): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      workerLog(this.options.sessionId, "reusing open websocket");
      return this.socket;
    }

    if (this.connectPromise) {
      workerLog(this.options.sessionId, "awaiting in-flight websocket connection");
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
    const existing = await readAgentWorkerRegistration(this.options.sessionId);
    if (existing) {
      try {
        workerLog(this.options.sessionId, "connecting to existing agent worker", {
          pid: existing.pid,
          port: existing.port,
          status: existing.status,
        });
        return await this.connectToRegistration(existing);
      } catch (error) {
        workerLog(this.options.sessionId, "existing agent worker connect failed", {
          error: error instanceof Error ? error.message : String(error),
          pid: existing.pid,
          port: existing.port,
        });
        // Fall through and relaunch the worker below.
      }
    }

    if (!forceStart && !existing) {
      throw new Error(`Agent worker ${this.options.sessionId} is unavailable.`);
    }

    await startAgentWorker({
      args: this.options.launchArgs,
      cwd: this.options.cwd,
      env: this.options.env,
      sessionId: this.options.sessionId,
    });
    return await this.connectToRegistration(
      await waitForAgentWorkerRegistration(this.options.sessionId),
    );
  }

  private async connectToRegistration(
    registration: AgentWorkerRegistration,
  ): Promise<WebSocket> {
    return await new Promise<WebSocket>((resolve, reject) => {
      workerLog(this.options.sessionId, "opening websocket", {
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
        workerLog(this.options.sessionId, "websocket open", {
          pid: registration.pid,
          port: registration.port,
        });
        settle(() => resolve(socket));
      };
      socket.onerror = () => {
        workerLog(this.options.sessionId, "websocket error", {
          pid: registration.pid,
          port: registration.port,
        });
        settle(() => reject(new Error(`Failed to connect to agent worker ${registration.sessionId}.`)));
      };
      socket.onclose = () => {
        workerLog(this.options.sessionId, "websocket closed", {
          pid: registration.pid,
          port: registration.port,
          settled,
        });
        if (!settled) {
          settle(() =>
            reject(new Error(`Agent worker ${registration.sessionId} closed before connecting.`)),
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

        const parsed = parseWorkerMessage(payload);
        if (isAgentWorkerSnapshot(parsed)) {
          workerLog(this.options.sessionId, "received state snapshot", {
            provider: parsed.provider,
            providerSessionId: parsed.providerSessionId,
            status: parsed.status,
            activeTurnId: parsed.activeTurnId,
            pendingApprovalId: parsed.pendingApproval?.id ?? null,
          });
          this.initialSnapshotReceived = true;
          void Promise.resolve(this.options.onState(parsed)).catch((error) => {
            workerLog(this.options.sessionId, "onState handler failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          });
          return;
        }
        workerLog(this.options.sessionId, "received worker event", {
          eventKind: parsed.kind,
          turnId: "turnId" in parsed ? parsed.turnId : null,
        });
        void Promise.resolve(this.options.onWorkerEvent(parsed)).catch((error) => {
          workerLog(this.options.sessionId, "onWorkerEvent handler failed", {
            eventKind: parsed.kind,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      };
    });
  }
}

async function connectAgentWorker(
  options: AgentWorkerOptions,
): Promise<IAgentWorker> {
  const worker = new AgentWorker(options);
  await worker.connect();
  await worker.waitForInitialSnapshot();
  return worker;
}

// ---------------------------------------------------------------------------
// Local worker implementation — bridge env, CLI args, process lifecycle
// ---------------------------------------------------------------------------

function normalizeClaudePermissionMode(permissionMode: string): string {
  if (permissionMode === "auto") {
    return "default";
  }
  return permissionMode;
}

async function createBridgeEnv(
  workspaceId: string,
  worktreePath: string,
): Promise<Record<string, string>> {
  try {
    const result = await invokeTauri<{ socketPath: string; sessionToken: string }>(
      "bridge_create_agent_session",
      { request: { workspaceId } },
    );
    return {
      LIFECYCLE_BRIDGE_SOCKET: result.socketPath,
      LIFECYCLE_BRIDGE_SESSION_TOKEN: result.sessionToken,
      LIFECYCLE_WORKSPACE_ID: workspaceId,
      LIFECYCLE_WORKSPACE_PATH: worktreePath,
    };
  } catch (error) {
    workerLog(workspaceId, "failed to create bridge session for agent", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

async function buildClaudeWorkerArgs(
  session: AgentSessionRecord,
  worktreePath: string,
): Promise<string[]> {
  const settings = parseSettingsJson(await readAppSettings());
  const claudeSettings = settings.harnesses.claude;
  const args = [
    "--provider",
    "claude",
    "--session-id",
    session.id,
    "--workspace-path",
    worktreePath,
    "--model",
    claudeSettings.model,
    "--permission-mode",
    normalizeClaudePermissionMode(claudeSettings.permissionMode),
    "--login-method",
    claudeSettings.loginMethod ?? "claudeai",
  ];

  if (claudeSettings.dangerousSkipPermissions) {
    args.push("--dangerous-skip-permissions");
  }
  if (claudeSettings.effort !== "default") {
    args.push("--effort", claudeSettings.effort);
  }
  if (session.provider_session_id?.trim()) {
    args.push("--provider-session-id", session.provider_session_id.trim());
  }

  return args;
}

async function buildCodexWorkerArgs(
  session: AgentSessionRecord,
  worktreePath: string,
): Promise<string[]> {
  const settings = parseSettingsJson(await readAppSettings());
  const codexSettings = settings.harnesses.codex;
  const args = [
    "--provider",
    "codex",
    "--session-id",
    session.id,
    "--workspace-path",
    worktreePath,
    "--model",
    codexSettings.model,
    "--approval-policy",
    codexSettings.approvalPolicy,
    "--sandbox-mode",
    codexSettings.sandboxMode,
  ];

  if (codexSettings.dangerousBypass) {
    args.push("--dangerous-bypass");
  }
  if (codexSettings.reasoningEffort !== "default") {
    args.push("--model-reasoning-effort", codexSettings.reasoningEffort);
  }
  if (session.provider_session_id?.trim()) {
    args.push("--provider-session-id", session.provider_session_id.trim());
  }

  return args;
}

async function buildWorkerArgs(
  session: AgentSessionRecord,
  worktreePath: string,
): Promise<string[]> {
  switch (session.provider) {
    case "claude":
      return buildClaudeWorkerArgs(session, worktreePath);
    case "codex":
      return buildCodexWorkerArgs(session, worktreePath);
  }
}

export async function createLocalWorker(
  options: CreateWorkerOptions,
): Promise<CreateWorkerResult> {
  const { session, context, onState, onWorkerEvent } = options;

  if (!context.worktreePath) {
    throw new Error(`Workspace ${session.workspace_id} has no worktree path.`);
  }

  const worktreePath = context.worktreePath;
  const launchArgs = await buildWorkerArgs(session, worktreePath);
  const env = await createBridgeEnv(session.workspace_id, worktreePath);

  workerLog(session.id, "launching local worker", {
    provider: session.provider,
    worktreePath,
  });

  const worker = await connectAgentWorker({
    cwd: worktreePath,
    env,
    launchArgs,
    onState,
    onWorkerEvent,
    sessionId: session.id,
  });

  return { session, worker };
}
