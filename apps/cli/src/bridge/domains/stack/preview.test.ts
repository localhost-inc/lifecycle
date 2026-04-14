import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { applyDbMigrations } from "@lifecycle/db/migrations";
import { insertRepository, insertWorkspaceStatement } from "@lifecycle/db/queries";
import { createTursoDb } from "@lifecycle/db/turso";
import { upsertStackRuntimeService } from "../stack";

import { workspaceHostLabel } from "../workspace";
import { createPreviewRequestRouter, type PreviewSocketData } from "./preview";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

async function reservePort(): Promise<number> {
  const server = createTcpServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to reserve a TCP port.");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return port;
}

describe("preview proxy", () => {
  test("proxies lifecycle.localhost hosts to the assigned service port", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-preview-proxy-"));
    tempDirs.push(dir);

    const previewPort = await reservePort();
    const upstream = createHttpServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          path: url.pathname,
          search: url.search,
        }),
      );
    });

    await new Promise<void>((resolve, reject) => {
      upstream.once("error", reject);
      upstream.listen(0, "127.0.0.1", () => resolve());
    });

    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("Failed to expose the upstream HTTP server.");
    }

    const db = await createTursoDb({
      clientName: "lifecycle-preview-proxy-test",
      path: join(dir, "bridge.db"),
    });
    await applyDbMigrations(db);

    const repositoryId = await insertRepository(db, {
      path: "/tmp/preview-project",
      name: "Preview Project",
    });
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      id: "ws_preview_1",
      repository_id: repositoryId,
      name: "Feature Preview",
      slug: "feature-preview",
      checkout_type: "worktree",
      source_ref: "lifecycle/feature-preview-wspreview",
      git_sha: null,
      workspace_root: "/tmp/preview-project/.worktrees/feature-preview",
      host: "local",
      manifest_fingerprint: null,
      prepared_at: now,
      status: "active",
      failure_reason: null,
      failed_at: null,
      created_at: now,
      updated_at: now,
      last_active_at: now,
    };
    const insert = insertWorkspaceStatement(workspace);
    await db.execute(insert.sql, insert.params);

    await upsertStackRuntimeService(workspace.id, {
      assigned_port: upstreamAddress.port,
      created_at: now,
      kind: "process",
      name: "web",
      pid: process.pid,
      status: "ready",
      status_reason: null,
      updated_at: now,
    });

    const preview = createPreviewRequestRouter(db);
    const server = Bun.serve<PreviewSocketData>({
      hostname: "127.0.0.1",
      port: previewPort,
      async fetch(request, bunServer) {
        return (
          (await preview.handleRequest(request, bunServer)) ??
          new Response("unexpected non-preview request", { status: 404 })
        );
      },
      websocket: {
        close(ws) {
          preview.close(ws);
        },
        message(ws, message) {
          preview.message(
            ws,
            typeof message === "string"
              ? message
              : message instanceof Uint8Array
                ? message
                : new Uint8Array(message),
          );
        },
        open(ws) {
          preview.open(ws);
        },
      },
    });
    try {
      const host = `web.${workspaceHostLabel(workspace)}.lifecycle.localhost:${previewPort}`;
      const response = await fetch(`http://127.0.0.1:${server.port}/hello?via=preview`, {
        headers: { host },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        path: "/hello",
        search: "?via=preview",
      });
    } finally {
      preview.stop();
      server.stop(true);
      await db.close();
      await new Promise<void>((resolve, reject) => {
        upstream.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
