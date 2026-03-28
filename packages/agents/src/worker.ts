import type { AgentSessionProviderId, AgentSessionRecord } from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace/client";
import type { AgentModelCatalog } from "./catalog";
import type { AgentSessionContext } from "./client";
import type { AgentAuthEvent, AgentAuthStatus } from "./providers/auth";
import type { ClaudeLoginMethod } from "./providers/claude/env";
import type { AgentRuntimeEvent, AgentRuntimeSnapshot } from "./runtime-protocol";
import type { AgentApprovalResolution, AgentTurnCancelRequest, AgentTurnRequest } from "./turn";

export interface AgentModelCatalogOptions {
  enabled?: boolean;
  loginMethod?: ClaudeLoginMethod;
  preferredModel?: string;
}

export interface AgentWorkerCommandClosePayload {
  code?: number | null;
  signal?: string | null;
}

export interface AgentWorkerCommand {
  onClose(listener: (payload: AgentWorkerCommandClosePayload) => void): void;
  onError(listener: (error: string) => void): void;
  onStderrData(listener: (chunk: string) => void): void;
  onStdoutData(listener: (chunk: string) => void): void;
  spawn(): Promise<void>;
}

export interface AgentWorkerCommandRunner {
  createCommand(args: string[]): AgentWorkerCommand;
}

export interface AgentWorkerCallbacks {
  onState(snapshot: AgentRuntimeSnapshot): void | Promise<void>;
  onEvent(event: AgentRuntimeEvent): void | Promise<void>;
}

export interface AgentSessionConnection {
  sendTurn(input: AgentTurnRequest): Promise<void>;
  cancelTurn(input: AgentTurnCancelRequest): Promise<void>;
  resolveApproval(input: AgentApprovalResolution): Promise<void>;
  /** Returns true if the underlying connection is still alive. */
  isHealthy?: () => boolean;
}

export interface AgentWorker {
  checkAuth(provider: AgentSessionProviderId): Promise<AgentAuthStatus>;
  getModelCatalog(
    provider: AgentSessionProviderId,
    options: AgentModelCatalogOptions,
  ): Promise<AgentModelCatalog>;
  login(
    provider: AgentSessionProviderId,
    onStatus?: (status: AgentAuthStatus) => void,
  ): Promise<AgentAuthStatus>;
  startSession(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    client: WorkspaceClient,
    callbacks: AgentWorkerCallbacks,
  ): Promise<AgentSessionRecord>;
  attachSession(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    client: WorkspaceClient,
    callbacks: AgentWorkerCallbacks,
  ): Promise<void>;
  sendTurn(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    client: WorkspaceClient,
    callbacks: AgentWorkerCallbacks,
    input: AgentTurnRequest,
  ): Promise<void>;
  cancelTurn(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    client: WorkspaceClient,
    callbacks: AgentWorkerCallbacks,
    input: AgentTurnCancelRequest,
  ): Promise<void>;
  resolveApproval(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    client: WorkspaceClient,
    callbacks: AgentWorkerCallbacks,
    input: AgentApprovalResolution,
  ): Promise<void>;
  disconnectSession(sessionId: string): void;
}

export interface CreateAgentWorkerInput {
  commandRunner: AgentWorkerCommandRunner;
  attachSessionConnection(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    client: WorkspaceClient,
    callbacks: AgentWorkerCallbacks,
  ): Promise<AgentSessionConnection>;
  startSessionConnection(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    client: WorkspaceClient,
    callbacks: AgentWorkerCallbacks,
  ): Promise<{ session: AgentSessionRecord; connection: AgentSessionConnection }>;
}

function statusFromResultEvent(
  event: Extract<AgentAuthEvent, { kind: "auth.result" }>,
): AgentAuthStatus {
  switch (event.state) {
    case "authenticated":
      return {
        state: "authenticated",
        email: event.email ?? null,
        organization: event.organization ?? null,
      };
    case "unauthenticated":
      return { state: "unauthenticated" };
    case "error":
      return {
        state: "error",
        message: event.message ?? "Authentication failed.",
      };
    case "not_checked":
      return { state: "not_checked" };
    case "checking":
      return { state: "checking" };
    case "authenticating":
      return { state: "authenticating", output: [] };
  }
}

function parseAuthEvent(line: string): AgentAuthEvent | null {
  try {
    const parsed = JSON.parse(line.trim()) as AgentAuthEvent;
    if (parsed.kind === "auth.result" || parsed.kind === "auth.status") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function createLineReader(onLine: (line: string) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) {
        return;
      }

      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.length > 0) {
        onLine(line);
      }
    }
  };
}

async function runAuthCommand(
  runner: AgentWorkerCommandRunner,
  subcommand: "status" | "login",
  provider: AgentSessionProviderId,
  onStatus?: (status: AgentAuthStatus) => void,
): Promise<AgentAuthStatus> {
  return await new Promise((resolve) => {
    const args = ["agent", "auth", subcommand, "--provider", provider];
    const command = runner.createCommand(args);
    let settled = false;

    const settle = (status: AgentAuthStatus) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(status);
    };

    const lineReader = createLineReader((line) => {
      const event = parseAuthEvent(line);
      if (!event) {
        return;
      }

      if (event.kind === "auth.status") {
        if (event.isAuthenticating) {
          onStatus?.({ state: "authenticating", output: event.output });
        } else if (event.error) {
          const status = { state: "error", message: event.error } as const;
          onStatus?.(status);
          settle(status);
        }
        return;
      }

      const status = statusFromResultEvent(event);
      onStatus?.(status);
      settle(status);
    });

    command.onStdoutData(lineReader);
    command.onStderrData(() => {});
    command.onError((error) => {
      const status = { state: "error", message: error } as const;
      onStatus?.(status);
      settle(status);
    });
    command.onClose(({ code, signal }) => {
      if (settled) {
        return;
      }

      const status = {
        state: "error",
        message: `Authentication process exited unexpectedly (code=${code ?? "null"} signal=${signal ?? "null"}).`,
      } as const;
      onStatus?.(status);
      settle(status);
    });

    void command.spawn().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const status = { state: "error", message } as const;
      onStatus?.(status);
      settle(status);
    });
  });
}

async function runCatalogCommand(
  runner: AgentWorkerCommandRunner,
  provider: AgentSessionProviderId,
  options: AgentModelCatalogOptions,
): Promise<AgentModelCatalog> {
  const args = ["agent", "catalog", "--provider", provider];
  if (provider === "claude" && options.loginMethod) {
    args.push("--login-method", options.loginMethod);
  }

  return await new Promise((resolve, reject) => {
    const command = runner.createCommand(args);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    command.onStdoutData((chunk) => {
      stdout += chunk;
    });
    command.onStderrData((chunk) => {
      stderr += chunk;
    });
    command.onError((message) => {
      settle(() => reject(new Error(message)));
    });
    command.onClose(({ code, signal }) => {
      settle(() => {
        if (code !== 0) {
          reject(
            new Error(
              stderr.trim() ||
                `Catalog command exited unexpectedly (code=${code ?? "null"} signal=${signal ?? "null"}).`,
            ),
          );
          return;
        }

        try {
          resolve(JSON.parse(stdout) as AgentModelCatalog);
        } catch (error) {
          reject(
            error instanceof Error ? error : new Error("Failed to parse agent model catalog."),
          );
        }
      });
    });

    void command.spawn().catch((error) => {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
  });
}

export function createAgentWorker(input: CreateAgentWorkerInput): AgentWorker {
  const sessionConnections = new Map<string, AgentSessionConnection>();

  async function ensureActiveSessionConnection(
    session: AgentSessionRecord,
    context: AgentSessionContext,
    client: WorkspaceClient,
    callbacks: AgentWorkerCallbacks,
  ): Promise<AgentSessionConnection> {
    const existing = sessionConnections.get(session.id);
    if (existing) {
      if (!existing.isHealthy || existing.isHealthy()) {
        return existing;
      }
      sessionConnections.delete(session.id);
    }

    const connection = await input.attachSessionConnection(session, context, client, callbacks);
    sessionConnections.set(session.id, connection);
    return connection;
  }

  return {
    checkAuth(provider) {
      return runAuthCommand(input.commandRunner, "status", provider);
    },
    getModelCatalog(provider, options) {
      return runCatalogCommand(input.commandRunner, provider, options);
    },
    login(provider, onStatus) {
      return runAuthCommand(input.commandRunner, "login", provider, onStatus);
    },
    async startSession(session, context, client, callbacks) {
      const existing = sessionConnections.get(session.id);
      if (existing && (!existing.isHealthy || existing.isHealthy())) {
        return session;
      }
      if (existing) {
        sessionConnections.delete(session.id);
      }

      const result = await input.startSessionConnection(session, context, client, callbacks);
      sessionConnections.set(session.id, result.connection);
      return result.session;
    },
    async attachSession(session, context, client, callbacks) {
      await ensureActiveSessionConnection(session, context, client, callbacks);
    },
    async sendTurn(session, context, client, callbacks, turn) {
      const connection = await ensureActiveSessionConnection(session, context, client, callbacks);
      await connection.sendTurn(turn);
    },
    async cancelTurn(session, context, client, callbacks, input) {
      const connection = await ensureActiveSessionConnection(session, context, client, callbacks);
      await connection.cancelTurn(input);
    },
    async resolveApproval(session, context, client, callbacks, input) {
      const connection = await ensureActiveSessionConnection(session, context, client, callbacks);
      await connection.resolveApproval(input);
    },
    disconnectSession(sessionId) {
      sessionConnections.delete(sessionId);
    },
  };
}
