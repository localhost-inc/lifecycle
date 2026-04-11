import type { ServerWebSocket } from "bun";
import { access, readFile } from "node:fs/promises";
import { ensureLifecycleDb, getLifecycleDb } from "@lifecycle/db";
import { createWorkspaceHostRegistry, type WorkspaceHostRegistry } from "../domains/workspace";
import { CloudWorkspaceHost } from "../domains/workspace/hosts/cloud";
import {
  LocalWorkspaceHost,
  invokeLocalWorkspaceCommand,
} from "../domains/workspace/hosts/local";
import { createControlPlaneClient } from "../domains/auth/control-plane";
import { startPreviewProxyServer, type PreviewProxyServer } from "../domains/stack/preview";
import { ensureDevRepositorySeeded } from "./dev-bootstrap";
import {
  bridgeRegistrationLookupPaths,
  readBridgeRegistrationAtPath,
  removeBridgeRegistration,
  removeBridgeRegistrationAtPath,
  writeBridgeRegistration,
} from "./registration";

let _workspaceRegistry: WorkspaceHostRegistry | null = null;
let workspaceRegistry: WorkspaceHostRegistry | null = null;

export function getWorkspaceRegistry(): WorkspaceHostRegistry {
  if (!_workspaceRegistry) {
    throw new Error("Bridge server not initialized.");
  }
  return _workspaceRegistry;
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

function getBridgeWorkspaceHostRegistry(): WorkspaceHostRegistry {
  if (!workspaceRegistry) {
    const localClient = new LocalWorkspaceHost({
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
    const cloudClient = new CloudWorkspaceHost({
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

    workspaceRegistry = createWorkspaceHostRegistry({
      cloud: cloudClient,
      local: localClient,
    });
  }

  return workspaceRegistry;
}

async function startBridgeHttpServer(options: {
  port?: number;
  workspaceRegistry: WorkspaceHostRegistry;
}) {
  await ensureLifecycleDb();
  const db = await getLifecycleDb();
  await ensureDevRepositorySeeded(db, options.workspaceRegistry);
  _workspaceRegistry = options.workspaceRegistry;
  const { app } = await import("./http/app");

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

  return { db, port: server.port, server };
}

export interface BridgeServer {
  port: number;
  server: BridgeHttpServer;
  shutdown(): Promise<void>;
  wait(): Promise<never>;
}

let activeBridgeServer: BridgeHttpServer | null = null;
let activePreviewProxyServer: PreviewProxyServer | null = null;
let bridgeKeepAliveTimer: ReturnType<typeof setInterval> | null = null;

function waitForever(): Promise<never> {
  if (bridgeKeepAliveTimer === null) {
    bridgeKeepAliveTimer = setInterval(() => {}, 1 << 30);
  }
  return new Promise<never>(() => {
    void bridgeKeepAliveTimer;
  });
}

export async function startBridgeServer(input: { port?: number } = {}): Promise<BridgeServer> {
  await stopRegisteredBridge();

  const { db, port, server } = await startBridgeHttpServer({
    ...(input.port != null ? { port: input.port } : {}),
    workspaceRegistry: getBridgeWorkspaceHostRegistry(),
  });
  activeBridgeServer = server;

  try {
    activePreviewProxyServer = await startPreviewProxyServer(db);
  } catch (error) {
    activeBridgeServer = null;
    server.stop(true);
    throw error;
  }

  await writeBridgeRegistration({ pid: process.pid, port: port as number });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    if (bridgeKeepAliveTimer !== null) {
      clearInterval(bridgeKeepAliveTimer);
      bridgeKeepAliveTimer = null;
    }
    activeBridgeServer = null;
    activePreviewProxyServer?.stop();
    activePreviewProxyServer = null;
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
      // Bun can exit even with a pending promise here, so keep an active timer
      // to pin the event loop for the bridge lifetime.
      void server;
      void activeBridgeServer;
      await waitForever();
      throw new Error("Unreachable");
    },
  };
}

export type { AppType } from "../routed.gen";
