import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  AgentWorkerCommand,
  AgentWorkerEvent,
  AgentWorkerRegistration,
  AgentWorkerSnapshot,
} from "@lifecycle/agents";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

const ProviderSchema = z.enum(["claude", "codex"]);
const CodexSandboxModeSchema = z.enum(["read-only", "workspace-write", "danger-full-access"]);
const CodexApprovalPolicySchema = z.enum(["untrusted", "on-request", "on-failure", "never"]);
const CodexModelReasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
const ClaudePermissionModeSchema = z.enum([
  "acceptEdits",
  "bypassPermissions",
  "default",
  "dontAsk",
  "plan",
]);
const ClaudeLoginMethodSchema = z.enum(["claudeai", "console"]);
const ClaudeEffortSchema = z.enum(["low", "medium", "high", "max"]);

const SessionInputSchema = z.object({
  provider: ProviderSchema,
  sessionId: z.string().min(1),
  registrationPath: z.string().optional(),
  workspacePath: z.string().min(1),

  approvalPolicy: CodexApprovalPolicySchema.default("untrusted"),
  dangerousBypass: z.boolean().default(false),
  sandboxMode: CodexSandboxModeSchema.default("workspace-write"),
  modelReasoningEffort: CodexModelReasoningEffortSchema.optional(),

  dangerousSkipPermissions: z.boolean().default(false),
  effort: ClaudeEffortSchema.optional(),
  loginMethod: ClaudeLoginMethodSchema.default("claudeai"),
  permissionMode: ClaudePermissionModeSchema.default("default"),

  model: z.string().optional(),
  providerSessionId: z.string().optional(),
});

type SessionInput = z.infer<typeof SessionInputSchema>;

function sessionLog(
  input: Pick<SessionInput, "provider" | "sessionId">,
  message: string,
  details?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.error(
    `[agent-session][${timestamp}][${input.provider}][${input.sessionId}] ${message}${suffix}`,
  );
}

function parseWorkerEvent(line: string): AgentWorkerEvent {
  return JSON.parse(line) as AgentWorkerEvent;
}

function createLineReader(onLine: (line: string) => void) {
  let buffer = "";

  return (chunk: string) => {
    buffer += chunk;

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        onLine(line);
      }
    }
  };
}

function buildWorkerArgs(input: SessionInput): string[] {
  const args = ["agent", "worker", input.provider, "--workspace-path", input.workspacePath];

  if (input.model?.trim()) {
    args.push("--model", input.model.trim());
  }
  if (input.providerSessionId?.trim()) {
    args.push("--provider-session-id", input.providerSessionId.trim());
  }

  if (input.provider === "claude") {
    args.push("--permission-mode", input.permissionMode, "--login-method", input.loginMethod);
    if (input.dangerousSkipPermissions) {
      args.push("--dangerous-skip-permissions");
    }
    if (input.effort) {
      args.push("--effort", input.effort);
    }
    return args;
  }

  args.push("--approval-policy", input.approvalPolicy, "--sandbox-mode", input.sandboxMode);
  if (input.dangerousBypass) {
    args.push("--dangerous-bypass");
  }
  if (input.modelReasoningEffort) {
    args.push("--model-reasoning-effort", input.modelReasoningEffort);
  }
  return args;
}

function buildSnapshot(input: SessionInput): AgentWorkerSnapshot {
  return {
    kind: "worker.state",
    provider: input.provider,
    providerSessionId: input.providerSessionId?.trim() || null,
    sessionId: input.sessionId,
    status: "starting",
    activeTurnId: null,
    pendingApproval: null,
    updatedAt: new Date().toISOString(),
  };
}

function toRegistration(
  snapshot: AgentWorkerSnapshot,
  input: SessionInput,
  port: number,
  token: string,
): AgentWorkerRegistration {
  return {
    provider: input.provider,
    providerSessionId: snapshot.providerSessionId,
    sessionId: input.sessionId,
    pid: process.pid,
    port,
    token,
    status: snapshot.status,
    activeTurnId: snapshot.activeTurnId,
    pendingApproval: snapshot.pendingApproval,
    updatedAt: snapshot.updatedAt,
  };
}

function updateSnapshotFromWorkerEvent(
  snapshot: AgentWorkerSnapshot,
  event: AgentWorkerEvent,
): AgentWorkerSnapshot {
  const updatedAt = new Date().toISOString();

  switch (event.kind) {
    case "worker.ready":
      return {
        ...snapshot,
        providerSessionId: event.providerSessionId,
        updatedAt,
      };
    case "agent.approval.requested":
      return {
        ...snapshot,
        status: event.approval.kind === "question" ? "waiting_input" : "waiting_approval",
        pendingApproval: {
          id: event.approval.id,
          kind: event.approval.kind,
        },
        updatedAt,
      };
    case "agent.approval.resolved":
      return {
        ...snapshot,
        status: "running",
        pendingApproval: null,
        updatedAt,
      };
    case "agent.turn.completed":
      return {
        ...snapshot,
        status: "idle",
        activeTurnId: null,
        pendingApproval: null,
        updatedAt,
      };
    case "agent.turn.failed":
      return {
        ...snapshot,
        status: "failed",
        activeTurnId: null,
        pendingApproval: null,
        updatedAt,
      };
    default:
      return snapshot;
  }
}

function updateSnapshotFromCommand(
  snapshot: AgentWorkerSnapshot,
  command: AgentWorkerCommand,
): AgentWorkerSnapshot {
  const updatedAt = new Date().toISOString();

  switch (command.kind) {
    case "worker.send_turn":
      return {
        ...snapshot,
        status: "running",
        activeTurnId: command.turnId,
        pendingApproval: null,
        updatedAt,
      };
    case "worker.cancel_turn":
      return {
        ...snapshot,
        status: "failed",
        activeTurnId: null,
        pendingApproval: null,
        updatedAt,
      };
    case "worker.resolve_approval":
      return {
        ...snapshot,
        status: "running",
        pendingApproval: null,
        updatedAt,
      };
  }
}

// Serialized atomic write: write to a temp file then rename, queued so
// concurrent fire-and-forget calls don't race and produce truncated JSON.
let registrationWriteChain = Promise.resolve();

function persistRegistration(
  input: SessionInput,
  snapshot: AgentWorkerSnapshot,
  port: number,
  token: string,
): Promise<void> {
  if (!input.registrationPath) {
    return Promise.resolve();
  }
  const registrationPath = input.registrationPath;
  registrationWriteChain = registrationWriteChain.then(
    async () => {
      const dir = dirname(registrationPath);
      const tmp = join(dir, `.${input.sessionId}.json.tmp`);
      await mkdir(dir, { recursive: true });
      await writeFile(
        tmp,
        `${JSON.stringify(toRegistration(snapshot, input, port, token))}\n`,
        "utf8",
      );
      await rename(tmp, registrationPath);
    },
    () => {
      /* swallow prior errors so the chain stays live */
    },
  );
  return registrationWriteChain;
}

function spawnWorkerChild(input: SessionInput): ChildProcessWithoutNullStreams {
  const cliEntry = process.argv[1];
  if (!cliEntry) {
    throw new Error("Lifecycle CLI could not resolve its entrypoint.");
  }

  return spawn(process.execPath, [cliEntry, ...buildWorkerArgs(input)], {
    cwd: input.workspacePath,
    env: { ...process.env, LIFECYCLE_AGENT_SESSION_ID: input.sessionId },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export default defineCommand({
  description: "Run a reconnectable agent worker session.",
  input: SessionInputSchema,
  async run(rawInput) {
    const input = rawInput as SessionInput;
    const token = randomUUID();

    sessionLog(input, "starting worker session", {
      hasProviderSessionId: Boolean(input.providerSessionId?.trim()),
      workspacePath: input.workspacePath,
    });

    let snapshot = buildSnapshot(input);
    let currentClient: Bun.ServerWebSocket<{ authenticated: boolean }> | null = null;
    let boundPort = 0;

    const worker = spawnWorkerChild(input);

    const server = Bun.serve<{ authenticated: boolean }>({
      idleTimeout: 0,
      port: 0,
      fetch(request, serverInstance) {
        const url = new URL(request.url);
        if (url.searchParams.get("token") !== token) {
          sessionLog(input, "rejected websocket upgrade with invalid token");
          return new Response("unauthorized", { status: 401 });
        }
        if (currentClient) {
          sessionLog(input, "replacing existing websocket client");
          currentClient.close(4001, "replaced");
          currentClient = null;
        }
        if (serverInstance.upgrade(request, { data: { authenticated: true } })) {
          return;
        }
        return new Response("upgrade failed", { status: 400 });
      },
      websocket: {
        message(_socket, message) {
          const text =
            typeof message === "string" ? message : Buffer.from(message).toString("utf8");
          const command = JSON.parse(text) as AgentWorkerCommand;
          sessionLog(input, "received desktop command", {
            activeTurnId: snapshot.activeTurnId,
            commandKind: command.kind,
            turnId: "turnId" in command ? (command.turnId ?? null) : null,
            approvalId: "approvalId" in command ? command.approvalId : null,
          });
          snapshot = updateSnapshotFromCommand(snapshot, command);
          void persistRegistration(input, snapshot, boundPort, token);
          worker.stdin.write(`${JSON.stringify(command)}\n`);
        },
        open(socket) {
          currentClient = socket;
          sessionLog(input, "websocket client connected", {
            port: boundPort,
            status: snapshot.status,
          });
          socket.send(JSON.stringify(snapshot));
        },
        close(socket) {
          if (currentClient === socket) {
            currentClient = null;
          }
          sessionLog(input, "websocket client disconnected", {
            status: snapshot.status,
          });
        },
      },
    });

    const port = server.port;
    if (typeof port !== "number") {
      throw new Error("Agent worker session did not bind a loopback port.");
    }
    boundPort = port;
    sessionLog(input, "listening", {
      port: boundPort,
    });

    await persistRegistration(input, snapshot, boundPort, token);

    const forwardToClient = (payload: string) => {
      if (currentClient) {
        currentClient.send(payload);
      }
    };

    const stdoutReader = createLineReader((line) => {
      try {
        const event = parseWorkerEvent(line);
        sessionLog(input, "worker event", {
          activeTurnId: snapshot.activeTurnId,
          eventKind: event.kind,
          turnId: "turnId" in event ? event.turnId : null,
        });
        snapshot = updateSnapshotFromWorkerEvent(snapshot, event);
        void persistRegistration(input, snapshot, boundPort, token);
      } catch (error) {
        sessionLog(input, "failed to parse worker event", {
          error: error instanceof Error ? error.message : String(error),
          line,
        });
      }

      forwardToClient(line);
    });

    worker.stdout.on("data", stdoutReader);
    worker.stderr.on("data", (chunk) => {
      const line = chunk.toString().trim();
      if (line.length > 0) {
        sessionLog(input, "worker stderr", { line });
      }
    });
    worker.on("error", (error) => {
      snapshot = {
        ...snapshot,
        status: "failed",
        activeTurnId: null,
        pendingApproval: null,
        updatedAt: new Date().toISOString(),
      };
      void persistRegistration(input, snapshot, boundPort, token);
      currentClient?.send(JSON.stringify(snapshot));
      sessionLog(input, "worker process error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    worker.on("close", (code, signal) => {
      snapshot = {
        ...snapshot,
        status: "failed",
        activeTurnId: null,
        pendingApproval: null,
        updatedAt: new Date().toISOString(),
      };
      void persistRegistration(input, snapshot, boundPort, token);
      currentClient?.send(JSON.stringify(snapshot));
      sessionLog(input, "worker exited", {
        code: code ?? null,
        signal: signal ?? null,
      });
      setTimeout(() => {
        server.stop(true);
        process.exit(code ?? 0);
      }, 50);
    });

    await new Promise<never>(() => {});
  },
});
