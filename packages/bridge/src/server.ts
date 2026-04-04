import type { ServerWebSocket } from "bun";
import type { StackClientRegistry } from "@lifecycle/stack";
import type { WorkspaceClientRegistry } from "@lifecycle/workspace";
import { ensureLifecycleDb } from "@lifecycle/db";

import { app } from "../routed.gen";
import { startActivityPoller } from "./activity";
import { BridgeError } from "./errors";

export interface BridgeServerOptions {
  port?: number;
  stackRegistry: StackClientRegistry;
  workspaceRegistry: WorkspaceClientRegistry;
}

let _stackRegistry: StackClientRegistry | null = null;
let _workspaceRegistry: WorkspaceClientRegistry | null = null;

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

export function getStackRegistry(): StackClientRegistry {
  if (!_stackRegistry) {
    throw new Error("Bridge server not initialized.");
  }
  return _stackRegistry;
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

export async function startBridgeServer(options: BridgeServerOptions) {
  await ensureLifecycleDb();
  _stackRegistry = options.stackRegistry;
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
        ws.subscribe("activity");
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

  startActivityPoller();

  return { port: server.port, server };
}

export type { AppType } from "../routed.gen";
