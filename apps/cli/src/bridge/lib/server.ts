import type { ServerWebSocket } from "bun";
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { ensureLifecycleDb, getLifecycleDb } from "@lifecycle/db";
import { resolveBridgePort } from "../domains/stack";
import {
  createWorkspaceHostRegistry,
  createWorkspaceWatchManager,
  type WorkspaceHostRegistry,
} from "../domains/workspace";
import { CloudWorkspaceHost } from "../domains/workspace/hosts/cloud";
import {
  LocalWorkspaceHost,
  invokeLocalWorkspaceCommand,
  watchPath,
} from "../domains/workspace/hosts/local";
import { createControlPlaneClient } from "../domains/auth/control-plane";
import {
  createPreviewRequestRouter,
  type PreviewRequestRouter,
  type PreviewSocketData,
} from "../domains/stack/preview";
import { ensureDevRepositorySeeded } from "./dev-bootstrap";
import {
  bridgeRegistrationLookupPaths,
  readBridgeRegistrationAtPath,
  removeBridgeRegistration,
  removeBridgeRegistrationAtPath,
  writeBridgeRegistration,
} from "./registration";
import {
  BRIDGE_GLOBAL_TOPIC,
  buildWorkspaceSnapshotInvalidatedMessage,
  workspaceTopic,
} from "./socket-topics";

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
  kind: "bridge";
};

type BridgeRuntimeSocketData = BridgeSocketData | PreviewSocketData;

export type BridgeSocketMessage =
  | { type: "subscribe"; topics: string[] }
  | { type: "unsubscribe"; topics: string[] }
  | { type: "ping" };

type BridgeHttpServer = ReturnType<typeof Bun.serve<BridgeRuntimeSocketData>>;

const clients = new Set<ServerWebSocket<BridgeSocketData>>();
const topicAwareClientIds = new Set<string>();

export function shouldDeliverTopicMessage(input: {
  subscribed: boolean;
  usesTopicSubscriptions: boolean;
}): boolean {
  return !input.usesTopicSubscriptions || input.subscribed;
}

export function broadcastMessage(message: object, topic?: string): void {
  const payload = JSON.stringify(message);
  if (topic) {
    for (const ws of clients) {
      if (
        shouldDeliverTopicMessage({
          subscribed: ws.isSubscribed(topic),
          usesTopicSubscriptions: topicAwareClientIds.has(ws.data.clientId),
        })
      ) {
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

function listeningPidsOnPort(port: number): number[] {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  const output = result.stdout?.trim() ?? "";
  if (!output) {
    return [];
  }

  return [
    ...new Set(
      output
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
        .filter(Number.isFinite),
    ),
  ];
}

function processCommand(pid: number): string | null {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
  const command = result.stdout?.trim() ?? "";
  return command.length > 0 ? command : null;
}

interface BridgeHealthMetadata {
  dev?: boolean;
  healthy?: boolean;
  pid?: number;
  repoRoot?: string | null;
}

async function readBridgeHealthOnPort(port: number): Promise<BridgeHealthMetadata | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as BridgeHealthMetadata;
    return body.healthy ? body : null;
  } catch {
    return null;
  }
}

function isLifecycleBridgeCommand(command: string): boolean {
  return (
    command.includes("lifecycle bridge start") ||
    command.includes("/src/index.ts bridge start") ||
    command.includes("\\src\\index.ts bridge start") ||
    command.includes("/src/bridge/app.ts") ||
    command.includes("\\src\\bridge\\app.ts")
  );
}

async function stopProcess(pid: number): Promise<void> {
  if (!isProcessAlive(pid)) {
    return;
  }

  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await sleep(100);
  }

  process.kill(pid, "SIGKILL");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await sleep(100);
  }

  throw new Error(`Lifecycle bridge process ${pid} did not stop cleanly.`);
}

async function reclaimLifecycleBridgePort(port: number): Promise<void> {
  const listenerPids = listeningPidsOnPort(port).filter((pid) => pid !== process.pid);
  const bridgeHealth = listenerPids.length > 0 ? await readBridgeHealthOnPort(port) : null;
  const expectedRepoRoot = process.env.LIFECYCLE_REPO_ROOT ?? null;
  for (const pid of listenerPids) {
    if (bridgeHealth?.pid === pid) {
      if (expectedRepoRoot && bridgeHealth.repoRoot && bridgeHealth.repoRoot !== expectedRepoRoot) {
        throw new Error(
          `Lifecycle bridge could not bind 127.0.0.1:${port} because it is owned by another repo at ${bridgeHealth.repoRoot}.`,
        );
      }

      await stopProcess(pid);
      continue;
    }

    const command = processCommand(pid);
    if (!command || !isLifecycleBridgeCommand(command)) {
      throw new Error(
        `Lifecycle bridge could not bind 127.0.0.1:${port} because it is already in use by ${command ?? `pid ${pid}`}.`,
      );
    }

    await stopProcess(pid);
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
      watchPath,
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
  port: number;
  workspaceRegistry: WorkspaceHostRegistry;
}) {
  await ensureLifecycleDb();
  const db = await getLifecycleDb();
  await ensureDevRepositorySeeded(db, options.workspaceRegistry);
  _workspaceRegistry = options.workspaceRegistry;
  const { app } = await import("./http/app");
  const previewRouter = createPreviewRequestRouter(db);

  const server = Bun.serve<BridgeRuntimeSocketData>({
    hostname: "127.0.0.1",
    port: options.port,
    idleTimeout: 0,
    async fetch(req, server) {
      const previewResponse = await previewRouter.handleRequest(req, server);
      if (previewResponse !== null) {
        return previewResponse;
      }

      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req, {
          data: { clientId: crypto.randomUUID(), kind: "bridge" } satisfies BridgeSocketData,
        });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        if (ws.data.kind === "preview") {
          previewRouter.open(ws as ServerWebSocket<PreviewSocketData>);
          return;
        }

        const bridgeSocket = ws as ServerWebSocket<BridgeSocketData>;
        clients.add(bridgeSocket);
        bridgeSocket.subscribe(BRIDGE_GLOBAL_TOPIC);
        bridgeSocket.send(
          JSON.stringify({ type: "connected", clientId: bridgeSocket.data.clientId }),
        );
      },
      message(ws, raw) {
        if (ws.data.kind === "preview") {
          previewRouter.message(
            ws as ServerWebSocket<PreviewSocketData>,
            typeof raw === "string" ? raw : raw instanceof Uint8Array ? raw : new Uint8Array(raw),
          );
          return;
        }

        try {
          const msg = JSON.parse(String(raw)) as BridgeSocketMessage;
          const bridgeSocket = ws as ServerWebSocket<BridgeSocketData>;
          switch (msg.type) {
            case "subscribe":
              topicAwareClientIds.add(bridgeSocket.data.clientId);
              for (const topic of msg.topics) bridgeSocket.subscribe(topic);
              break;
            case "unsubscribe":
              topicAwareClientIds.add(bridgeSocket.data.clientId);
              for (const topic of msg.topics) bridgeSocket.unsubscribe(topic);
              break;
            case "ping":
              bridgeSocket.send(JSON.stringify({ type: "pong" }));
              break;
          }
        } catch {
          // ignore malformed messages
        }
      },
      close(ws) {
        if (ws.data.kind === "preview") {
          previewRouter.close(ws as ServerWebSocket<PreviewSocketData>);
          return;
        }

        const bridgeSocket = ws as ServerWebSocket<BridgeSocketData>;
        topicAwareClientIds.delete(bridgeSocket.data.clientId);
        clients.delete(bridgeSocket);
      },
    },
  });

  return { port: server.port, previewRouter, server };
}

export interface BridgeServer {
  port: number;
  server: BridgeHttpServer;
  shutdown(): Promise<void>;
  wait(): Promise<never>;
}

let activeBridgeServer: BridgeHttpServer | null = null;
let activePreviewRouter: PreviewRequestRouter | null = null;
let activeWorkspaceWatchManager: ReturnType<typeof createWorkspaceWatchManager> | null = null;
let bridgeKeepAliveTimer: ReturnType<typeof setInterval> | null = null;

export function requestWorkspaceWatchSync(): void {
  void activeWorkspaceWatchManager?.sync();
}

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
  const port = input.port ?? resolveBridgePort();
  await reclaimLifecycleBridgePort(port);

  const {
    port: boundPort,
    previewRouter,
    server,
  } = await startBridgeHttpServer({
    port,
    workspaceRegistry: getBridgeWorkspaceHostRegistry(),
  });
  activeBridgeServer = server;
  activePreviewRouter = previewRouter;
  activeWorkspaceWatchManager = createWorkspaceWatchManager({
    db: await getLifecycleDb(),
    workspaceRegistry: getBridgeWorkspaceHostRegistry(),
    onWorkspaceInvalidated: (workspaceId) => {
      broadcastMessage(
        buildWorkspaceSnapshotInvalidatedMessage({
          reason: "files.changed",
          workspaceId,
        }),
        workspaceTopic(workspaceId),
      );
    },
  });
  await activeWorkspaceWatchManager.sync();

  await writeBridgeRegistration({
    pid: process.pid,
    port: boundPort as number,
    repoRoot: process.env.LIFECYCLE_REPO_ROOT ?? null,
    dev: process.env.LIFECYCLE_DEV === "1" || process.env.LIFECYCLE_DEV_SUPERVISOR === "monorepo",
    startedAt: new Date().toISOString(),
    supervisorPid: process.env.LIFECYCLE_DEV_SUPERVISOR_PID
      ? Number.parseInt(process.env.LIFECYCLE_DEV_SUPERVISOR_PID, 10)
      : null,
  });

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
    activePreviewRouter?.stop();
    activePreviewRouter = null;
    activeWorkspaceWatchManager?.stop();
    activeWorkspaceWatchManager = null;
    server.stop(true);
    await removeBridgeRegistration();
  };

  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

  return {
    port: boundPort as number,
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
