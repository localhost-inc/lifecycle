import { DurableObject } from "cloudflare:workers";

// ── SQL schema applied on first access ──────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workspace_state (
  id            TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton',
  workspace_id  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'provisioning',
  sandbox_id    TEXT,
  failure_reason TEXT,
  last_heartbeat_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session (
  id                  TEXT PRIMARY KEY NOT NULL,
  provider            TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
  provider_session_id TEXT,
  title               TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'starting'
                        CHECK (status IN ('starting', 'idle', 'running', 'waiting_input',
                                          'waiting_approval', 'completed', 'failed', 'cancelled')),
  last_message_at     TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message (
  id         TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  text       TEXT NOT NULL DEFAULT '',
  turn_id    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_message_session ON message(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS message_part (
  id         TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  part_index INTEGER NOT NULL DEFAULT 0,
  part_type  TEXT NOT NULL,
  text       TEXT,
  data       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, part_index)
);

CREATE INDEX IF NOT EXISTS idx_message_part_message ON message_part(message_id, part_index ASC);

CREATE TABLE IF NOT EXISTS event_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_queue (
  id         TEXT PRIMARY KEY NOT NULL,
  session_id TEXT,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'dispatched', 'completed', 'failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_queue_status ON prompt_queue(status, created_at ASC);
`;

// ── Types ───────────────────────────────────────────────────────────────────

interface WorkspaceStateRow {
  workspace_id: string;
  status: string;
  sandbox_id: string | null;
  failure_reason: string | null;
  last_heartbeat_at: string | null;
}

interface SessionRow {
  id: string;
  provider: string;
  provider_session_id: string | null;
  title: string;
  status: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PromptRow {
  id: string;
  session_id: string | null;
  content: string;
  status: string;
  created_at: string;
}

interface EventLogRow {
  id: number;
  kind: string;
  payload: string;
  created_at: string;
}

/** Inbound WebSocket message from a connected client or bridge. */
type InboundMessage =
  | { type: "subscribe"; topics: string[] }
  | { type: "unsubscribe"; topics: string[] }
  | { type: "ping" }
  | { type: "event"; event: { kind: string; [key: string]: unknown } }
  | { type: "heartbeat" };

/** Serializable per-connection metadata stored via serializeAttachment. */
interface SocketAttachment {
  role: "client" | "bridge";
  topics: string[];
  connectedAt: string;
}

// ── Durable Object ──────────────────────────────────────────────────────────

export interface WorkspaceDOEnv {
  DB: D1Database;
  WORKSPACE_DO: DurableObjectNamespace<WorkspaceDO>;
  DAYTONA_API_KEY: string;
  DAYTONA_SNAPSHOT: string;
  WORKOS_API_KEY: string;
  WORKOS_CLIENT_ID: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_SLUG: string;
}

export class WorkspaceDO extends DurableObject<WorkspaceDOEnv> {
  private initialized = false;

  private ensureSchema(): void {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(SCHEMA_SQL);
    this.initialized = true;
  }

  // ── HTTP ────────────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    this.ensureSchema();

    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    if (request.method === "GET" && path === "/state") {
      return json(this.getState());
    }

    if (request.method === "GET" && path === "/sessions") {
      return json(this.listSessions());
    }

    if (request.method === "POST" && path === "/prompt") {
      const body = (await request.json()) as {
        id: string;
        sessionId?: string;
        content: string;
      };
      return json(this.enqueuePrompt(body));
    }

    if (request.method === "POST" && path === "/init") {
      const body = (await request.json()) as {
        workspaceId: string;
        sandboxId?: string;
      };
      return json(this.initWorkspace(body));
    }

    if (request.method === "GET" && path === "/events") {
      const after = url.searchParams.get("after");
      return json(this.getEvents(after ? parseInt(after, 10) : 0));
    }

    return new Response("Not found", { status: 404 });
  }

  // ── WebSocket (hibernation API) ─────────────────────────────────────────

  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") === "bridge" ? "bridge" : "client";

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server, [role]);

    const attachment: SocketAttachment = {
      role,
      topics: ["activity"],
      connectedAt: new Date().toISOString(),
    };
    server.serializeAttachment(attachment);

    server.send(JSON.stringify({
      type: "connected",
      state: this.getState(),
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    this.ensureSchema();
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);

    let msg: InboundMessage;
    try {
      msg = JSON.parse(text) as InboundMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;

      case "subscribe": {
        const attachment = ws.deserializeAttachment() as SocketAttachment;
        for (const topic of msg.topics) {
          if (!attachment.topics.includes(topic)) attachment.topics.push(topic);
        }
        ws.serializeAttachment(attachment);
        break;
      }

      case "unsubscribe": {
        const attachment = ws.deserializeAttachment() as SocketAttachment;
        attachment.topics = attachment.topics.filter((t) => !msg.topics.includes(t));
        ws.serializeAttachment(attachment);
        break;
      }

      case "heartbeat": {
        const attachment = ws.deserializeAttachment() as SocketAttachment;
        if (attachment.role === "bridge") {
          this.updateHeartbeat();
        }
        break;
      }

      case "event": {
        const attachment = ws.deserializeAttachment() as SocketAttachment;
        if (attachment.role === "bridge" && msg.event) {
          this.ingestEvent(msg.event);
        }
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    ws.close(1011, "Unexpected error");
  }

  // ── State ───────────────────────────────────────────────────────────────

  private getState(): WorkspaceStateRow | null {
    const rows = this.ctx.storage.sql
      .exec("SELECT workspace_id, status, sandbox_id, failure_reason, last_heartbeat_at FROM workspace_state WHERE id = 'singleton'")
      .toArray() as unknown as WorkspaceStateRow[];
    return rows[0] ?? null;
  }

  private initWorkspace(input: { workspaceId: string; sandboxId?: string }): WorkspaceStateRow {
    this.ctx.storage.sql.exec(
      `INSERT INTO workspace_state (id, workspace_id, sandbox_id)
       VALUES ('singleton', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         sandbox_id = COALESCE(excluded.sandbox_id, workspace_state.sandbox_id),
         updated_at = datetime('now')`,
      input.workspaceId,
      input.sandboxId ?? null,
    );
    return this.getState()!;
  }

  private updateHeartbeat(): void {
    this.ctx.storage.sql.exec(
      "UPDATE workspace_state SET last_heartbeat_at = datetime('now'), updated_at = datetime('now') WHERE id = 'singleton'",
    );
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  private listSessions(): SessionRow[] {
    return this.ctx.storage.sql
      .exec("SELECT id, provider, provider_session_id, title, status, last_message_at, created_at, updated_at FROM session ORDER BY created_at ASC")
      .toArray() as unknown as SessionRow[];
  }

  // ── Prompt queue ────────────────────────────────────────────────────────

  private enqueuePrompt(input: {
    id: string;
    sessionId?: string;
    content: string;
  }): PromptRow {
    this.ctx.storage.sql.exec(
      "INSERT INTO prompt_queue (id, session_id, content) VALUES (?, ?, ?)",
      input.id,
      input.sessionId ?? null,
      input.content,
    );

    const prompt: PromptRow = {
      id: input.id,
      session_id: input.sessionId ?? null,
      content: input.content,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    // Notify the sandbox bridge
    this.broadcast(
      { type: "prompt.queued", prompt },
      undefined,
      (attachment) => attachment.role === "bridge",
    );

    return prompt;
  }

  // ── Event ingestion ─────────────────────────────────────────────────────

  private ingestEvent(event: { kind: string; [key: string]: unknown }): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO event_log (kind, payload) VALUES (?, ?)",
      event.kind,
      JSON.stringify(event),
    );

    const topic = eventTopic(event.kind);
    this.broadcast({ type: "event", event }, topic);
  }

  // ── Event replay ────────────────────────────────────────────────────────

  private getEvents(afterId: number): EventLogRow[] {
    return this.ctx.storage.sql
      .exec("SELECT id, kind, payload, created_at FROM event_log WHERE id > ? ORDER BY id ASC LIMIT 1000", afterId)
      .toArray() as unknown as EventLogRow[];
  }

  // ── Broadcast ───────────────────────────────────────────────────────────

  private broadcast(
    message: object,
    topic?: string,
    filter?: (attachment: SocketAttachment) => boolean,
  ): void {
    const payload = JSON.stringify(message);

    for (const ws of this.ctx.getWebSockets()) {
      try {
        const attachment = ws.deserializeAttachment() as SocketAttachment | null;
        if (!attachment) continue;
        if (filter && !filter(attachment)) continue;
        if (topic && !attachment.topics.includes(topic)) continue;
        ws.send(payload);
      } catch {
        // Socket may be closed — hibernation API will clean it up.
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function eventTopic(kind: string): string | undefined {
  if (kind.startsWith("agent.")) return "agent";
  if (kind.startsWith("service.")) return "services";
  if (kind.startsWith("git.")) return "git";
  if (kind.startsWith("workspace.")) return "activity";
  return undefined;
}
