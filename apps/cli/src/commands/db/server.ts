import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineCommand } from "@localhost-inc/cmd";
import {
  createDbServerUrl,
  DB_SERVER_TOKEN_HEADER,
  type DbServerErrorResponse,
  type DbServerRegistration,
  type DbServerRequest,
  type DbServerResponse,
  type DbServerStatsResult,
} from "@lifecycle/db/server";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { createTursoDb } from "@lifecycle/db/turso";
import { z } from "zod";
import { jsonResponse, optionsResponse } from "./server-http";

const DbServerInputSchema = z.object({
  authToken: z.string().optional(),
  clientName: z.string().default("lifecycle-desktop"),
  dbPath: z.string().min(1),
  registrationPath: z.string().min(1),
  remoteUrl: z.string().optional(),
});

type DbServerInput = z.infer<typeof DbServerInputSchema>;

function dbServerLog(message: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.error(`[db-server][${timestamp}] ${message}${suffix}`);
}

async function persistRegistration(
  registrationPath: string,
  registration: DbServerRegistration,
): Promise<void> {
  const dir = dirname(registrationPath);
  const tempPath = join(dir, `.${registration.pid}.json.tmp`);
  await mkdir(dir, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(registration)}\n`, "utf8");
  await rename(tempPath, registrationPath);
}

function unauthorizedResponse(requestId: string): Response {
  return jsonResponse({
    ok: false,
    requestId,
    error: {
      code: "unauthorized",
      message: "Invalid db server token.",
    },
  } satisfies DbServerErrorResponse);
}

function errorResponse(requestId: string, code: string, message: string): Response {
  return jsonResponse({
    ok: false,
    requestId,
    error: {
      code,
      message,
    },
  } satisfies DbServerErrorResponse);
}

async function handleRequest(
  db: Awaited<ReturnType<typeof createTursoDb>>,
  request: DbServerRequest,
): Promise<DbServerResponse> {
  switch (request.kind) {
    case "select":
      return {
        ok: true,
        requestId: request.requestId,
        result: await db.select(request.sql, request.params),
      };
    case "execute":
      return {
        ok: true,
        requestId: request.requestId,
        result: await db.execute(request.sql, request.params),
      };
    case "transaction":
      return {
        ok: true,
        requestId: request.requestId,
        result: await db.transaction(request.statements),
      };
    case "pull":
      if (db.mode !== "synced") {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "sync_disabled",
            message: "pull() is unavailable while the database is in local mode.",
          },
        };
      }
      return {
        ok: true,
        requestId: request.requestId,
        result: await db.pull(),
      };
    case "push":
      if (db.mode !== "synced") {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "sync_disabled",
            message: "push() is unavailable while the database is in local mode.",
          },
        };
      }
      await db.push();
      return {
        ok: true,
        requestId: request.requestId,
        result: null,
      };
    case "stats":
      if (db.mode !== "synced") {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "sync_disabled",
            message: "stats() is unavailable while the database is in local mode.",
          },
        };
      }
      return {
        ok: true,
        requestId: request.requestId,
        result: {
          stats: await db.stats(),
        } satisfies DbServerStatsResult,
      };
    case "health":
      return {
        ok: false,
        requestId: request.requestId,
        error: {
          code: "invalid_request",
          message: "health requests are handled by the server wrapper.",
        },
      };
  }
}

export default defineCommand({
  description: "Run the Lifecycle database server.",
  input: DbServerInputSchema,
  async run(rawInput, context) {
    const input = rawInput as DbServerInput;
    const token = randomUUID();
    const db = await createTursoDb({
      path: input.dbPath,
      clientName: input.clientName,
      ...(input.remoteUrl ? { url: input.remoteUrl } : {}),
      ...(input.authToken ? { authToken: input.authToken } : {}),
    });

    await applyDbMigrations(db);

    let registration: DbServerRegistration = {
      dbPath: input.dbPath,
      mode: db.mode,
      pid: process.pid,
      port: 0,
      token,
      updatedAt: new Date().toISOString(),
    };

    const server = Bun.serve({
      hostname: "127.0.0.1",
      idleTimeout: 0,
      port: 0,
      async fetch(request) {
        if (request.method === "OPTIONS") {
          return optionsResponse();
        }

        const requestId = randomUUID();
        if (request.headers.get(DB_SERVER_TOKEN_HEADER) !== token) {
          return unauthorizedResponse(requestId);
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return errorResponse(requestId, "invalid_request", "Request body must be valid JSON.");
        }

        const parsed = payload as Partial<DbServerRequest>;
        if (!parsed || typeof parsed !== "object" || typeof parsed.kind !== "string") {
          return errorResponse(requestId, "invalid_request", "Request body is malformed.");
        }

        const typedRequest = {
          ...parsed,
          requestId:
            typeof parsed.requestId === "string" && parsed.requestId.length > 0
              ? parsed.requestId
              : requestId,
        } as DbServerRequest;

        try {
          if (typedRequest.kind === "health") {
            return jsonResponse({
              ok: true,
              requestId: typedRequest.requestId,
              result: {
                ok: true,
                dbPath: registration.dbPath,
                mode: registration.mode,
              },
            });
          }

          const response = await handleRequest(db, typedRequest);
          return jsonResponse(response);
        } catch (error) {
          dbServerLog("request failed", {
            error: error instanceof Error ? error.message : String(error),
            kind: typedRequest.kind,
          });
          return errorResponse(
            typedRequest.requestId,
            "request_failed",
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    });

    const port = server.port;
    if (typeof port !== "number") {
      throw new Error("Lifecycle DB server failed to bind a loopback port.");
    }

    registration = {
      ...registration,
      port,
      updatedAt: new Date().toISOString(),
    };
    await persistRegistration(input.registrationPath, registration);

    dbServerLog("listening", {
      dbPath: input.dbPath,
      mode: registration.mode,
      port,
      url: createDbServerUrl(port),
    });
    context.stderr(`Lifecycle DB server listening on ${createDbServerUrl(port)}`);

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      dbServerLog("shutting down", { signal });
      server.stop(true);
      await db.close();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    await new Promise(() => {});
    return 0;
  },
});
