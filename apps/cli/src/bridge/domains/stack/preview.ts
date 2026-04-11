import type { SqlDriver } from "@lifecycle/db";
import { listAllWorkspaces } from "@lifecycle/db/queries";
import {
  parsePreviewHost,
  readStackRuntimeState,
  resolvePreviewProxyPort,
  slugify,
} from "../stack";
import { workspaceHostLabel } from "../workspace";

type ProxyMessage = ArrayBuffer | string | Uint8Array;

type PreviewSocketData = {
  connectionId: string;
  protocols: string[];
  upstreamUrl: string;
};

type PreviewSocketState = {
  queue: ProxyMessage[];
  upstream: WebSocket | null;
};

export interface PreviewTarget {
  assignedPort: number;
  host: string;
  serviceName: string;
  workspaceId: string;
}

export interface PreviewProxyServer {
  port: number;
  stop(): void;
}

type PreviewResolution =
  | { kind: "not_preview_host"; host: string | null }
  | { host: string; kind: "not_running"; serviceName: string; workspaceId: string }
  | { host: string; kind: "not_found" }
  | { kind: "ready"; target: PreviewTarget };

function normalizeHost(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.split(":")[0]?.trim().toLowerCase() ?? null;
}

function parseProtocols(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function formatUpstreamUrl(input: {
  pathname: string;
  port: number;
  protocol: "http" | "ws";
  search: string;
}): string {
  return `${input.protocol}://127.0.0.1:${input.port}${input.pathname}${input.search}`;
}

function previewErrorResponse(message: string, status: number): Response {
  return new Response(message, {
    headers: { "content-type": "text/plain; charset=utf-8" },
    status,
  });
}

function cloneProxyHeaders(request: Request, sourceHost: string): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", sourceHost);
  headers.set("x-forwarded-proto", "http");
  return headers;
}

async function resolvePreviewTarget(
  db: SqlDriver,
  requestHost: string | null,
): Promise<PreviewResolution> {
  const host = normalizeHost(requestHost);
  if (!host) {
    return { host: null, kind: "not_preview_host" };
  }

  const parsed = parsePreviewHost(host);
  if (!parsed) {
    return { host, kind: "not_preview_host" };
  }

  const workspaces = await listAllWorkspaces(db);
  const workspace = workspaces.find(
    (candidate) =>
      candidate.status !== "archived" && workspaceHostLabel(candidate) === parsed.hostLabel,
  );
  if (!workspace) {
    return { host, kind: "not_found" };
  }

  const runtimeState = await readStackRuntimeState(workspace.id);
  const service = Object.values(runtimeState.services).find(
    (candidate) => slugify(candidate.name) === parsed.serviceLabel,
  );
  if (!service || service.assigned_port === null || service.status !== "ready") {
    return {
      host,
      kind: "not_running",
      serviceName: service?.name ?? parsed.serviceLabel,
      workspaceId: workspace.id,
    };
  }

  return {
    kind: "ready",
    target: {
      assignedPort: service.assigned_port,
      host,
      serviceName: service.name,
      workspaceId: workspace.id,
    },
  };
}

async function proxyHttpRequest(request: Request, target: PreviewTarget): Promise<Response> {
  const upstreamUrl = formatUpstreamUrl({
    pathname: new URL(request.url).pathname,
    port: target.assignedPort,
    protocol: "http",
    search: new URL(request.url).search,
  });
  const method = request.method.toUpperCase();
  const headers = cloneProxyHeaders(request, target.host);

  return fetch(upstreamUrl, {
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    headers,
    method: request.method,
    redirect: "manual",
    signal: request.signal,
  });
}

function sendOrQueue(state: PreviewSocketState, message: ProxyMessage): void {
  if (state.upstream?.readyState === WebSocket.OPEN) {
    state.upstream.send(message);
    return;
  }

  state.queue.push(message);
}

function closeUpstream(state: PreviewSocketState): void {
  if (state.upstream && state.upstream.readyState < WebSocket.CLOSING) {
    state.upstream.close();
  }
}

export async function startPreviewProxyServer(db: SqlDriver): Promise<PreviewProxyServer> {
  const socketState = new Map<string, PreviewSocketState>();
  const previewPort = resolvePreviewProxyPort();

  const server = Bun.serve<PreviewSocketData>({
    hostname: "127.0.0.1",
    idleTimeout: 0,
    port: previewPort,
    async fetch(request, serverInstance) {
      const resolution = await resolvePreviewTarget(db, request.headers.get("host"));
      if (resolution.kind === "not_preview_host") {
        return previewErrorResponse(
          "Lifecycle preview proxy only accepts *.lifecycle.localhost hosts.",
          404,
        );
      }

      if (resolution.kind === "not_found") {
        return previewErrorResponse(`No Lifecycle preview route is registered for ${resolution.host}.`, 404);
      }

      if (resolution.kind === "not_running") {
        return previewErrorResponse(
          `Lifecycle service ${resolution.serviceName} is not ready in workspace ${resolution.workspaceId}.`,
          502,
        );
      }

      const upgrade = request.headers.get("upgrade");
      if (upgrade && upgrade.toLowerCase() === "websocket") {
        const connectionId = crypto.randomUUID();
        socketState.set(connectionId, { queue: [], upstream: null });
        const requestUrl = new URL(request.url);
        const upgraded = serverInstance.upgrade(request, {
          data: {
            connectionId,
            protocols: parseProtocols(request.headers.get("sec-websocket-protocol")),
            upstreamUrl: formatUpstreamUrl({
              pathname: requestUrl.pathname,
              port: resolution.target.assignedPort,
              protocol: "ws",
              search: requestUrl.search,
            }),
          },
        });

        if (upgraded) {
          return undefined;
        }

        socketState.delete(connectionId);
        return previewErrorResponse("Lifecycle preview WebSocket upgrade failed.", 500);
      }

      return proxyHttpRequest(request, resolution.target);
    },
    websocket: {
      open(ws) {
        const state = socketState.get(ws.data.connectionId);
        if (!state) {
          ws.close(1011, "Lifecycle preview socket state was unavailable.");
          return;
        }

        const upstream = new WebSocket(
          ws.data.upstreamUrl,
          ws.data.protocols.length > 0 ? ws.data.protocols : undefined,
        );

        upstream.binaryType = "arraybuffer";
        upstream.onopen = () => {
          for (const message of state.queue) {
            upstream.send(message);
          }
          state.queue.length = 0;
        };
        upstream.onmessage = (event) => {
          ws.send(event.data as string | ArrayBuffer | Uint8Array);
        };
        upstream.onerror = () => {
          ws.close(1011, "Lifecycle preview upstream WebSocket failed.");
        };
        upstream.onclose = () => {
          if (ws.readyState < 2) {
            ws.close();
          }
        };

        state.upstream = upstream;
      },
      close(ws) {
        const state = socketState.get(ws.data.connectionId);
        if (state) {
          closeUpstream(state);
          socketState.delete(ws.data.connectionId);
        }
      },
      message(ws, message) {
        const state = socketState.get(ws.data.connectionId);
        if (!state) {
          ws.close(1011, "Lifecycle preview socket state was unavailable.");
          return;
        }

        if (typeof message === "string") {
          sendOrQueue(state, message);
          return;
        }

        sendOrQueue(state, new Uint8Array(message));
      },
    },
  });

  return {
    port: server.port as number,
    stop: () => {
      for (const state of socketState.values()) {
        closeUpstream(state);
      }
      socketState.clear();
      server.stop(true);
    },
  };
}
