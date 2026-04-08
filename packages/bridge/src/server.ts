import type { ServerWebSocket } from "bun";
import { access, readFile } from "node:fs/promises";
import { ensureLifecycleDb, getLifecycleDb } from "@lifecycle/db";
import { createWorkspaceClientRegistry, type WorkspaceClientRegistry } from "@lifecycle/workspace";
import { CloudWorkspaceClient } from "@lifecycle/workspace/internal/cloud";
import {
  LocalWorkspaceClient,
  invokeLocalWorkspaceCommand,
} from "@lifecycle/workspace/internal/local";

import { app } from "../routed.gen";
import { createAgentManager, type AgentManager } from "./agents";
import { createControlPlaneClient } from "./control-plane";
import { BridgeError } from "./errors";
import {
  bridgeRegistrationLookupPaths,
  readBridgeRegistration,
  readBridgeRegistrationAtPath,
  removeBridgeRegistration,
  removeBridgeRegistrationAtPath,
  writeBridgeRegistration,
} from "./registration";

let _workspaceRegistry: WorkspaceClientRegistry | null = null;
let _agentManager: AgentManager | null = null;
let workspaceRegistry: WorkspaceClientRegistry | null = null;

app.onError((error, ctx) => {
  const message =
    error instanceof Error
      ? error.message
      : `Bridge request failed because a non-Error value was thrown: ${String(error)}`;
  const status: 400 | 401 | 403 | 404 | 409 | 422 | 500 =
    error instanceof BridgeError ? error.status : 500;
  const code = error instanceof BridgeError ? error.code : "internal_error";
  return ctx.json(
    {
      error: {
        code,
        message,
      },
    },
    status,
  );
});

export function getWorkspaceRegistry(): WorkspaceClientRegistry {
  if (!_workspaceRegistry) {
    throw new Error("Bridge server not initialized.");
  }
  return _workspaceRegistry;
}

export function getAgentManager(): AgentManager {
  if (!_agentManager) {
    throw new Error("Bridge server not initialized.");
  }
  return _agentManager;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

export type BridgeSocketData = {
  clientId: string;
};

export type BridgeSocketMessage =
  | { type: "subscribe"; topics: string[] }
  | { type: "unsubscribe"; topics: string[] }
  | { type: "ping" };

type BridgeHttpServer = ReturnType<typeof Bun.serve<BridgeSocketData>>;

const clients = new Set<ServerWebSocket<BridgeSocketData>>();

export function broadcastMessage(message: object, topic?: string): void {
  const payload = JSON.stringify(message);
  if (topic) {
    for (const ws of clients) {
      if (ws.isSubscribed(topic)) {
        ws.send(payload);
      }
    }
  } else {
    for (const ws of clients) {
      ws.send(payload);
    }
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code !== "ESRCH";
  }
}

async function stopRegisteredBridge(): Promise<void> {
  for (const path of bridgeRegistrationLookupPaths()) {
    const existing = await readBridgeRegistrationAtPath(path);
    if (!existing || existing.pid === process.pid) {
      continue;
    }

    if (isProcessAlive(existing.pid)) {
      process.kill(existing.pid, "SIGTERM");
      for (let attempt = 0; attempt < 50; attempt++) {
        if (!isProcessAlive(existing.pid)) {
          break;
        }
        await sleep(100);
      }
      if (isProcessAlive(existing.pid)) {
        throw new Error(`Existing bridge process ${existing.pid} did not stop cleanly.`);
      }
    }

    await removeBridgeRegistrationAtPath(path);
  }
}

function getBridgeWorkspaceClientRegistry(): WorkspaceClientRegistry {
  if (!workspaceRegistry) {
    const localClient = new LocalWorkspaceClient({
      invoke: invokeLocalWorkspaceCommand,
      fileReader: {
        exists: async (path) => {
          try {
            await access(path);
            return true;
          } catch {
            return false;
          }
        },
        readTextFile: (path) => readFile(path, "utf8"),
      },
    });
    const cloudClient = new CloudWorkspaceClient({
      execWorkspaceCommand: async (workspaceId, command) => {
        const client = createControlPlaneClient();
        const response = await client.workspaces[":workspaceId"].exec.$post({
          param: { workspaceId },
          json: { command },
        });
        const result = await response.json();
        return {
          exitCode: result.exitCode ?? 1,
          stderr: result.stderr ?? "",
          stdout: result.stdout ?? "",
        };
      },
      getShellConnection: async (workspaceId) => {
        const client = createControlPlaneClient();
        const response = await client.workspaces[":workspaceId"].shell.$get({
          param: { workspaceId },
        });
        const result = await response.json();
        return {
          cwd: result.cwd,
          home: result.home,
          host: result.host,
          token: result.token,
        };
      },
    });

    workspaceRegistry = createWorkspaceClientRegistry({
      cloud: cloudClient,
      local: localClient,
    });
  }

  return workspaceRegistry;
}

async function startBridgeHttpServer(options: {
  port?: number;
  workspaceRegistry: WorkspaceClientRegistry;
}) {
  await ensureLifecycleDb();
  _workspaceRegistry = options.workspaceRegistry;

  const server = Bun.serve<BridgeSocketData>({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    idleTimeout: 0,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req, {
          data: { clientId: crypto.randomUUID() } satisfies BridgeSocketData,
        });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        ws.send(JSON.stringify({ type: "connected", clientId: ws.data.clientId }));
      },
      message(ws, raw) {
        try {
          const msg = JSON.parse(String(raw)) as BridgeSocketMessage;
          switch (msg.type) {
            case "subscribe":
              for (const topic of msg.topics) ws.subscribe(topic);
              break;
            case "unsubscribe":
              for (const topic of msg.topics) ws.unsubscribe(topic);
              break;
            case "ping":
              ws.send(JSON.stringify({ type: "pong" }));
              break;
          }
        } catch {
          // ignore malformed messages
        }
      },
      close(ws) {
        clients.delete(ws);
      },
    },
  });

  _agentManager = createAgentManager({
    baseUrl: `http://127.0.0.1:${server.port}`,
    driver: await getLifecycleDb(),
    workspaceRegistry: options.workspaceRegistry,
  });
  await _agentManager.initialize();

  return { port: server.port, server };
}

export interface BridgeServer {
  port: number;
  server: BridgeHttpServer;
  shutdown(): Promise<void>;
  wait(): Promise<never>;
}

export async function startBridgeServer(input: { port?: number } = {}): Promise<BridgeServer> {
  await stopRegisteredBridge();

  const { port, server } = await startBridgeHttpServer({
    ...(input.port != null ? { port: input.port } : {}),
    workspaceRegistry: getBridgeWorkspaceClientRegistry(),
  });

  await writeBridgeRegistration({ pid: process.pid, port: port as number });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    server.stop(true);
    await removeBridgeRegistration();
  };

  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

  return {
    port: port as number,
    server,
    shutdown,
    wait: async () => {
      // Keep a strong reference to the Bun server for the lifetime of the bridge process.
      void server;
      await new Promise(() => {});
      throw new Error("Unreachable");
    },
  };
}

export type { AppType } from "../routed.gen";
