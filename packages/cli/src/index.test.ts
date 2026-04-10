import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseManifest } from "@lifecycle/contracts";

import { main } from "./index";

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      stderr: (message: string) => stderr.push(message),
      stdout: (message: string) => stdout.push(message),
    },
    stderr,
    stdout,
  };
}

async function withEnvironment<T>(
  environment: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(environment)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withDesktopRpc<T>(
  handler: (request: unknown) => Promise<unknown> | unknown,
  run: (bridgePath: string) => Promise<T>,
): Promise<T> {
  const sandboxDir = await mkdtemp(join(tmpdir(), "lifecycle-cli-bridge-"));
  const bridgePath = join(sandboxDir, "bridge.sock");
  const server = createServer((socket) => {
    let input = "";
    let responded = false;

    const maybeRespond = async () => {
      if (responded || !input.includes("\n")) {
        return;
      }

      responded = true;
      const response = await handler(JSON.parse(input.trim()));
      socket.write(`${JSON.stringify(response)}\n`);
      socket.end();
    };

    socket.on("data", (chunk) => {
      input += chunk.toString("utf8");
      void maybeRespond();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(bridgePath, () => resolve());
  });

  try {
    return await run(bridgePath);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await rm(sandboxDir, { force: true, recursive: true });
  }
}

async function withHttpBridge<T>(
  handler: (request: {
    body: unknown;
    method: string;
    pathname: string;
    search: URLSearchParams;
  }) => Promise<{ body: unknown; status?: number } | unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const homeDir = await mkdtemp(join(tmpdir(), "lifecycle-cli-home-"));
  const server = createHttpServer(async (request, response) => {
    if (!request.url || !request.method) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Malformed bridge request." } }));
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ healthy: true }));
      return;
    }

    let input = "";
    for await (const chunk of request) {
      input += chunk.toString("utf8");
    }

    const result = await handler({
      body: input.length > 0 ? JSON.parse(input) : null,
      method: request.method,
      pathname: url.pathname,
      search: url.searchParams,
    });
    const shaped =
      result && typeof result === "object" && "body" in result
        ? (result as { body: unknown; status?: number })
        : { body: result, status: 200 };

    response.writeHead(shaped.status ?? 200, { "content-type": "application/json" });
    response.end(JSON.stringify(shaped.body));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Mock bridge failed to expose a TCP port.");
    }

    return await withEnvironment(
      {
        HOME: homeDir,
        LIFECYCLE_BRIDGE_URL: `http://127.0.0.1:${address.port}`,
      },
      run,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await rm(homeDir, { force: true, recursive: true });
  }
}

describe("lifecycle cli", () => {
  test("prints dynamic root help with no args", async () => {
    const sink = createIo();

    const code = await main([], sink.io);

    expect(code).toBe(0);
    expect(sink.stdout[0]).toContain("Usage: lifecycle <command> [flags]");
    expect(sink.stdout[0]).toContain("browser");
    expect(sink.stdout[0]).toContain("context");
    expect(sink.stdout[0]).toContain("project");
    expect(sink.stdout[0]).toContain("proxy");
    expect(sink.stdout[0]).toContain("service");
    expect(sink.stdout[0]).toContain("tab");
    expect(sink.stdout[0]).toContain("workspace");
    expect(sink.stderr).toEqual([]);
  });

  test("prints dynamic workspace namespace help when only the namespace is provided", async () => {
    const sink = createIo();

    const code = await main(["workspace"], sink.io);

    expect(code).toBe(0);
    expect(sink.stdout[0]).toContain("Usage: lifecycle workspace <command> [flags]");
    expect(sink.stdout[0]).toContain("create");
    expect(sink.stdout[0]).toContain("run");
    expect(sink.stdout[0]).toContain("status");
    expect(sink.stderr).toEqual([]);
  });

  test("prints dynamic workspace namespace help for --help", async () => {
    const sink = createIo();

    const code = await main(["workspace", "--help"], sink.io);

    expect(code).toBe(0);
    expect(sink.stdout[0]).toContain("Usage: lifecycle workspace <command> [flags]");
    expect(sink.stdout[0]).toContain("health");
    expect(sink.stderr).toEqual([]);
  });

  test("prints dynamic service namespace help for --help", async () => {
    const sink = createIo();

    const code = await main(["service", "--help"], sink.io);

    expect(code).toBe(0);
    expect(sink.stdout[0]).toContain("Usage: lifecycle service <command> [flags]");
    expect(sink.stdout[0]).toContain("info");
    expect(sink.stdout[0]).toContain("list");
    expect(sink.stdout[0]).toContain("start");
    expect(sink.stdout[0]).toContain("set");
    expect(sink.stderr).toEqual([]);
  });

  test("parses tab open commands", async () => {
    const sink = createIo();
    await withDesktopRpc(
      (request) => {
        expect(request).toMatchObject({
          method: "tab.open",
          params: {
            surface: "preview",
            url: "http://localhost:3000",
            workspaceId: "ws_123",
          },
          session: {
            token: "session-token",
          },
        });

        return {
          id: (request as { id: string }).id,
          method: "tab.open",
          ok: true,
          result: {
            repositoryId: "project_123",
            surface: "preview",
            tabKey: "preview:url:1234",
            url: "http://localhost:3000",
            workspaceId: "ws_123",
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_DESKTOP_SOCKET: bridgePath,
            LIFECYCLE_DESKTOP_SESSION_TOKEN: "session-token",
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () =>
            await main(
              [
                "tab",
                "open",
                "--surface",
                "preview",
                "--url",
                "http://localhost:3000",
                "--workspace-id",
                "ws_123",
              ],
              sink.io,
            ),
        );

        expect(code).toBe(0);
      },
    );

    expect(sink.stdout).toEqual(["Opened preview tab preview:url:1234 for http://localhost:3000."]);
    expect(sink.stderr).toEqual([]);
  });

  test("opens preview tabs with an explicit workspace id and no shell session token", async () => {
    const sink = createIo();
    await withDesktopRpc(
      (request) => {
        const typedRequest = request as {
          id: string;
          session?: unknown;
        };

        expect(typedRequest).toMatchObject({
          method: "tab.open",
          params: {
            surface: "preview",
            url: "http://127.0.0.1:45558",
            workspaceId: "ws_123",
          },
        });
        expect(typedRequest.session).toBeUndefined();

        return {
          id: typedRequest.id,
          method: "tab.open",
          ok: true,
          result: {
            repositoryId: "project_123",
            surface: "preview",
            tabKey: "preview:url:5678",
            url: "http://127.0.0.1:45558",
            workspaceId: "ws_123",
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_DESKTOP_SOCKET: bridgePath,
            LIFECYCLE_DESKTOP_SESSION_TOKEN: undefined,
          },
          async () =>
            await main(
              [
                "tab",
                "open",
                "--surface",
                "preview",
                "--url",
                "http://127.0.0.1:45558",
                "--workspace-id",
                "ws_123",
              ],
              sink.io,
            ),
        );

        expect(code).toBe(0);
      },
    );

    expect(sink.stdout).toEqual([
      "Opened preview tab preview:url:5678 for http://127.0.0.1:45558.",
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("validates surface-specific tab open flags", async () => {
    const sink = createIo();

    const code = await main(["tab", "open", "--surface", "preview"], sink.io);

    expect(code).toBe(1);
    expect(sink.stderr).toEqual(["--surface preview requires --url."]);
  });

  test("parses service info positional arguments through the bridge", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "GET",
          pathname: "/workspaces/ws_123/stack",
        });

        return {
          stack: {
            errors: [],
            nodes: [
              {
                assigned_port: 3000,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "api",
                preview_url: "http://control-plane.lifecycle.localhost",
                runtime: "process",
                status: "ready",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            state: "ready",
            workspace_id: "ws_123",
          },
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["service", "info", "api"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(sink.stdout).toEqual([
      "api",
      "status: ready",
      "port: 3000",
      "preview: http://control-plane.lifecycle.localhost",
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("lists services through the bridge", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "GET",
          pathname: "/workspaces/ws_123/stack",
        });

        return {
          stack: {
            errors: [],
            nodes: [
              {
                assigned_port: 3000,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "api",
                preview_url: "http://control-plane.lifecycle.localhost",
                runtime: "process",
                status: "ready",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
              {
                assigned_port: 6379,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "redis",
                preview_url: null,
                runtime: "image",
                status: "starting",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            state: "ready",
            workspace_id: "ws_123",
          },
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["service", "list"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(sink.stdout).toEqual([
      "api",
      "status: ready",
      "port: 3000",
      "preview: http://control-plane.lifecycle.localhost",
      "",
      "redis",
      "status: starting",
      "port: 6379",
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("starts services through the bridge", async () => {
    const sink = createIo();
    let receivedRequest: unknown = null;

    await withHttpBridge(
      async (request) => {
        receivedRequest = request;
        return {
          stack: {
            errors: [],
            nodes: [
              {
                assigned_port: 3000,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "api",
                preview_url: "http://control-plane.lifecycle.localhost",
                runtime: "process",
                status: "ready",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            state: "ready",
            workspace_id: "ws_123",
          },
          startedServices: ["api"],
          workspaceId: "ws_123",
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["service", "start", "api"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(receivedRequest).toMatchObject({
      method: "POST",
      pathname: "/workspaces/ws_123/stack/start",
      body: {
        serviceNames: ["api"],
      },
    });
    expect(sink.stdout).toEqual([
      "Started services: api",
      "api",
      "status: ready",
      "port: 3000",
      "preview: http://control-plane.lifecycle.localhost",
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("starts stack services through the bridge", async () => {
    const sink = createIo();
    let receivedRequest: unknown = null;

    await withHttpBridge(
      async (request) => {
        receivedRequest = request;
        return {
          stack: {
            errors: [],
            nodes: [
              {
                assigned_port: 3000,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "api",
                preview_url: "http://control-plane.lifecycle.localhost",
                runtime: "process",
                status: "ready",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            state: "ready",
            workspace_id: "ws_123",
          },
          startedServices: ["api"],
          workspaceId: "ws_123",
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["stack", "run", "api"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(receivedRequest).toMatchObject({
      method: "POST",
      pathname: "/workspaces/ws_123/stack/start",
      body: {
        serviceNames: ["api"],
      },
    });
    expect(sink.stdout).toEqual([
      "Started services: api",
      "api",
      "status: ready",
      "port: 3000",
      "preview: http://control-plane.lifecycle.localhost",
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("prints stack status through the bridge", async () => {
    const sink = createIo();

    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "GET",
          pathname: "/workspaces/ws_123/stack",
        });

        return {
          stack: {
            errors: [],
            nodes: [
              {
                assigned_port: 3000,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "api",
                preview_url: "http://control-plane.lifecycle.localhost",
                runtime: "process",
                status: "ready",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
              {
                assigned_port: null,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "redis",
                preview_url: null,
                runtime: "image",
                status: "stopped",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            state: "ready",
            workspace_id: "ws_123",
          },
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["stack", "status"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(sink.stdout).toEqual(["● api              ready  :3000", "○ redis            stopped"]);
    expect(sink.stderr).toEqual([]);
  });

  test("stops stack services through the bridge", async () => {
    const sink = createIo();
    let receivedRequest: unknown = null;

    await withHttpBridge(
      async (request) => {
        receivedRequest = request;
        return {
          stack: {
            errors: [],
            nodes: [
              {
                assigned_port: null,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "api",
                preview_url: null,
                runtime: "process",
                status: "stopped",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            state: "ready",
            workspace_id: "ws_123",
          },
          stoppedServices: ["api"],
          workspaceId: "ws_123",
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["stack", "stop", "api"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(receivedRequest).toMatchObject({
      method: "POST",
      pathname: "/workspaces/ws_123/stack/stop",
      body: {
        serviceNames: ["api"],
      },
    });
    expect(sink.stdout).toEqual(["Stopped: api", "api", "status: stopped"]);
    expect(sink.stderr).toEqual([]);
  });

  test("prints stack logs through the bridge", async () => {
    const sink = createIo();

    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "GET",
          pathname: "/workspaces/ws_123/logs",
        });
        expect(request.search.get("tail")).toBe("10");

        return {
          cursor: "cursor_1",
          lines: [
            {
              service: "api",
              stream: "stdout",
              text: "listening on 3000",
              timestamp: "",
            },
            {
              service: "worker",
              stream: "stderr",
              text: "retrying job",
              timestamp: "",
            },
          ],
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["stack", "logs", "--tail", "10"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(sink.stdout).toEqual([" api listening on 3000", " worker ERR retrying job"]);
    expect(sink.stderr).toEqual([]);
  });

  test("prints service logs through the bridge", async () => {
    const sink = createIo();

    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "GET",
          pathname: "/workspaces/ws_123/logs",
        });
        expect(request.search.get("service")).toBe("api");

        return {
          cursor: "cursor_1",
          lines: [
            {
              service: "api",
              stream: "stdout",
              text: "ready",
              timestamp: "",
            },
          ],
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["service", "logs", "api", "--json"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(JSON.parse(sink.stdout[0] ?? "null")).toEqual([
      {
        service: "api",
        stream: "stdout",
        text: "ready",
        timestamp: "",
      },
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("prints structured context by default", async () => {
    const sink = createIo();
    await withDesktopRpc(
      (request) => {
        expect(request).toMatchObject({
          method: "context.read",
          params: {
            workspaceId: "ws_123",
          },
          session: {
            token: "session-token",
          },
        });

        return {
          id: (request as { id: string }).id,
          method: "context.read",
          ok: true,
          result: {
            capabilities: {
              cliInstalled: true,
              context: true,
              service: {
                health: false,
                get: true,
                list: true,
                logs: false,
                set: false,
                start: true,
                stop: false,
              },
            },
            cli: {
              path: "/tmp/lifecycle",
            },
            commands: [
              "lifecycle context",
              "lifecycle service list",
              "lifecycle service info <service>",
              "lifecycle service start [service...]",
            ],
            desktopRpc: {
              available: true,
              session: true,
            },
            environment: {
              healthy: true,
              readyServiceCount: 1,
              totalServiceCount: 1,
            },
            git: {
              available: true,
              status: {
                ahead: 0,
                behind: 0,
                branch: "feat/cli",
                files: [],
                headSha: "abc123",
                upstream: "origin/feat/cli",
              },
            },
            provider: {
              name: "local",
              shellRpc: true,
            },
            session: {
              workspaceId: "ws_123",
            },
            services: [
              {
                assigned_port: 3000,
                created_at: "2026-03-21T00:00:00.000Z",
                id: "svc_123",
                name: "api",
                preview_url: "http://control-plane.lifecycle.localhost",
                status: "ready",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            workspace: {
              checkout_type: "worktree",
              created_at: "2026-03-21T00:00:00.000Z",
              failed_at: null,
              failure_reason: null,
              git_sha: "abc123",
              id: "ws_123",
              last_active_at: "2026-03-21T00:00:00.000Z",
	              manifest_fingerprint: "manifest_123",
	              name: "Feature Workspace",
	              slug: "feature-workspace",
	              prepared_at: "2026-03-21T00:00:00.000Z",
              repository_id: "project_123",
              source_ref: "feat/cli",
              status: "active",
              host: "local",
              updated_at: "2026-03-21T00:00:00.000Z",
              workspace_root: "/repo/.worktrees/ws_123",
            },
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_DESKTOP_SOCKET: bridgePath,
            LIFECYCLE_DESKTOP_SESSION_TOKEN: "session-token",
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["context"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
      capabilities: {
        cliInstalled: true,
      },
      cli: {
        path: "/tmp/lifecycle",
      },
      commands: expect.arrayContaining(["lifecycle context", "lifecycle service list"]),
      desktopRpc: {
        available: true,
        session: true,
      },
      environment: {
        healthy: true,
        readyServiceCount: 1,
        totalServiceCount: 1,
      },
      session: {
        workspaceId: "ws_123",
      },
      provider: {
        name: "local",
        shellRpc: true,
      },
      workspace: {
        id: "ws_123",
        repository_id: "project_123",
      },
    });
    expect(sink.stderr).toEqual([]);
  });

  test("prints workspace status as json", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "GET",
          pathname: "/workspaces/ws_123",
        });

        return {
          stack: {
            errors: [],
            nodes: [
              {
                assigned_port: null,
                created_at: "2026-03-21T00:00:00.000Z",
                depends_on: [],
                kind: "service",
                name: "api",
                preview_url: null,
                runtime: "process",
                status: "stopped",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            state: "ready",
            workspace_id: "ws_123",
          },
          workspace: {
            checkout_type: "worktree",
            created_at: "2026-03-21T00:00:00.000Z",
            failed_at: null,
            failure_reason: null,
            git_sha: "abc123",
            id: "ws_123",
            last_active_at: "2026-03-21T00:00:00.000Z",
	            manifest_fingerprint: "manifest_123",
	            name: "Feature Workspace",
	            slug: "feature-workspace",
	            prepared_at: "2026-03-21T00:00:00.000Z",
            repository_id: "project_123",
            source_ref: "feat/cli",
            status: "idle",
            host: "local",
            updated_at: "2026-03-21T00:00:00.000Z",
            workspace_root: "/repo/.worktrees/ws_123",
          },
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["workspace", "status", "--json"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
      stack: {
        state: "ready",
      },
      workspace: {
        id: "ws_123",
        status: "idle",
      },
    });
    expect(sink.stderr).toEqual([]);
  });

  test("archives the current workspace through the bridge", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "DELETE",
          pathname: "/workspaces/ws_123",
        });
        expect(request.search.get("repoPath")).toBeNull();

        return {
          archived: true,
          name: "Feature Workspace",
          workspaceRoot: "/repo/.worktrees/ws_123",
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["workspace", "destroy", "--json"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
      archived: true,
      name: "Feature Workspace",
    });
    expect(sink.stderr).toEqual([]);
  });

  test("runs workspace health through the bridge", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "GET",
          pathname: "/workspaces/ws_123/health",
        });

        return {
          checks: [
            {
              healthy: true,
              message: null,
              service: "api",
            },
          ],
          workspace: {
            checkout_type: "worktree",
            created_at: "2026-03-21T00:00:00.000Z",
            failed_at: null,
            failure_reason: null,
            git_sha: "abc123",
            id: "ws_123",
            last_active_at: "2026-03-21T00:00:00.000Z",
            manifest_fingerprint: "manifest_123",
            name: "Feature Workspace",
            slug: "feature-workspace",
            prepared_at: "2026-03-21T00:00:00.000Z",
            repository_id: "project_123",
            source_ref: "feat/cli",
            status: "active",
            host: "local",
            updated_at: "2026-03-21T00:00:00.000Z",
            workspace_root: "/repo/.worktrees/ws_123",
          },
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["workspace", "health", "--json"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
      checks: [
        {
          healthy: true,
          service: "api",
        },
      ],
      workspace: {
        id: "ws_123",
      },
    });
    expect(sink.stderr).toEqual([]);
  });

  test("resets the workspace through the bridge", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          body: null,
          method: "POST",
          pathname: "/workspaces/ws_123/reset",
        });

        return {
          workspace: {
            checkout_type: "worktree",
            created_at: "2026-03-21T00:00:00.000Z",
            failed_at: null,
            failure_reason: null,
            git_sha: "abc123",
            id: "ws_123",
            last_active_at: "2026-03-21T00:00:00.000Z",
            manifest_fingerprint: "manifest_123",
            name: "Feature Workspace",
            slug: "feature-workspace",
            prepared_at: "2026-03-21T00:00:00.000Z",
            repository_id: "project_123",
            source_ref: "feat/cli",
            status: "active",
            host: "local",
            updated_at: "2026-03-21T00:00:00.000Z",
            workspace_root: "/repo/.worktrees/ws_123",
          },
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["workspace", "reset", "--json"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
      workspace: {
        id: "ws_123",
        status: "active",
      },
    });
    expect(sink.stderr).toEqual([]);
  });

  test("archives a named workspace through bridge-owned archive policy", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "DELETE",
          pathname: "/workspaces/feature-workspace",
        });
        expect(request.search.get("repoPath")).toBe("/repo");
        expect(request.search.get("force")).toBe("true");

        return {
          archived: true,
          name: "feature-workspace",
          workspaceRoot: "/repo/.worktrees/feature-workspace",
        };
      },
      async () => {
        const code = await withEnvironment({}, async () =>
          await main(
            ["workspace", "archive", "feature-workspace", "--repo-path", "/repo", "--force", "--json"],
            sink.io,
          ),
        );

        expect(code).toBe(0);
      },
    );

    expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
      archived: true,
      name: "feature-workspace",
    });
    expect(sink.stderr).toEqual([]);
  });

  test("emits workspace activity through the bridge using terminal session env", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          body: {
            event: "turn.started",
            metadata: {
              source: "hook",
            },
            provider: "codex",
            terminalId: "term_123",
            turnId: "turn_123",
          },
          method: "POST",
          pathname: "/workspaces/ws_123/activity",
        });

        return {
          busy: true,
          terminals: [
            {
              busy: true,
              last_event_at: "2026-04-09T00:00:00.000Z",
              metadata: {
                source: "hook",
              },
              provider: "codex",
              source: "explicit",
              state: "turn_active",
              terminal_id: "term_123",
              tool_name: null,
              turn_id: "turn_123",
              updated_at: "2026-04-09T00:00:00.000Z",
              waiting_kind: null,
            },
          ],
          updated_at: "2026-04-09T00:00:00.000Z",
          workspace_id: "ws_123",
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_TERMINAL_ID: "term_123",
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () =>
            await main(
              [
                "workspace",
                "activity",
                "emit",
                "turn.started",
                "--turn-id",
                "turn_123",
                "--provider",
                "codex",
                "--metadata",
                '{"source":"hook"}',
              ],
              sink.io,
            ),
        );

        expect(code).toBe(0);
      },
    );

    expect(sink.stdout).toEqual([]);
    expect(sink.stderr).toEqual([]);
  });

  test("fails workspace activity emit when terminal context cannot be resolved", async () => {
    const sink = createIo();

    const code = await withEnvironment(
      {
        LIFECYCLE_TERMINAL_ID: undefined,
        LIFECYCLE_WORKSPACE_ID: "ws_123",
      },
      async () => await main(["workspace", "activity", "emit", "turn.started"], sink.io),
    );

    expect(code).toBe(1);
    expect(sink.stdout).toEqual([]);
    expect(sink.stderr).toEqual([
      "Lifecycle could not resolve a terminal for this command.",
      "Suggested action: Pass --terminal-id or run the command from a Lifecycle-managed terminal session.",
    ]);
  });

  test("prints workspace activity status as json", async () => {
    const sink = createIo();
    await withHttpBridge(
      async (request) => {
        expect(request).toMatchObject({
          method: "GET",
          pathname: "/workspaces/ws_123/activity",
        });

        return {
          busy: true,
          terminals: [
            {
              busy: false,
              last_event_at: "2026-04-09T00:00:00.000Z",
              metadata: null,
              provider: "codex",
              source: "explicit",
              state: "waiting",
              terminal_id: "term_123",
              tool_name: null,
              turn_id: "turn_123",
              updated_at: "2026-04-09T00:00:00.000Z",
              waiting_kind: "approval",
            },
          ],
          updated_at: "2026-04-09T00:00:00.000Z",
          workspace_id: "ws_123",
        };
      },
      async () => {
        const code = await withEnvironment(
          {
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () => await main(["workspace", "activity", "status", "--json"], sink.io),
        );

        expect(code).toBe(0);
      },
    );

    expect(JSON.parse(sink.stdout[0] ?? "null")).toEqual({
      busy: true,
      terminals: [
        {
          busy: false,
          last_event_at: "2026-04-09T00:00:00.000Z",
          metadata: null,
          provider: "codex",
          source: "explicit",
          state: "waiting",
          terminal_id: "term_123",
          tool_name: null,
          turn_id: "turn_123",
          updated_at: "2026-04-09T00:00:00.000Z",
          waiting_kind: "approval",
        },
      ],
      updated_at: "2026-04-09T00:00:00.000Z",
      workspace_id: "ws_123",
    });
    expect(sink.stderr).toEqual([]);
  });

  test("validates required service info positionals", async () => {
    const sink = createIo();

    const code = await main(["service", "info"], sink.io);

    expect(code).toBe(1);
    expect(sink.stderr).toEqual([
      "lifecycle service info requires exactly one <service> argument.",
    ]);
  });

  test("installs repo-scoped harness config idempotently", async () => {
    const sink = createIo();
    const repoPath = await mkdtemp(join(tmpdir(), "lifecycle-cli-repo-install-"));

    try {
      await mkdir(join(repoPath, ".claude"), { recursive: true });
      await mkdir(join(repoPath, ".codex"), { recursive: true });
      await writeFile(
        join(repoPath, ".claude", "settings.json"),
        `${JSON.stringify(
          {
            hooks: {
              Stop: [
                {
                  hooks: [
                    {
                      command:
                        'sh "${CLAUDE_PROJECT_DIR}/.lifecycle/hooks/activity.sh" turn.completed --provider claude-code --old-flag',
                      type: "command",
                    },
                  ],
                },
              ],
            },
            permissions: {
              allow: ["Read"],
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeFile(
        join(repoPath, ".mcp.json"),
        `${JSON.stringify(
          {
            mcpServers: {
              lifecycle: {
                args: ["old"],
                command: "old-lifecycle",
                enabled: true,
              },
            },
            version: 1,
          },
          null,
          2,
        )}\n`,
      );
      await writeFile(
        join(repoPath, ".codex", "config.toml"),
        ['[mcp_servers.lifecycle]', 'notes = "keep me"', 'command = "old-lifecycle"', "", "[features]", 'theme = "light"', ""].join("\n"),
      );
      await writeFile(
        join(repoPath, ".codex", "hooks.json"),
        `${JSON.stringify(
          {
            hooks: {
              Stop: [
                {
                  hooks: [
                    {
                      command:
                        'sh "$(git rev-parse --show-toplevel)/.lifecycle/hooks/activity.sh" turn.completed --provider codex --old-flag',
                      type: "command",
                    },
                  ],
                },
              ],
            },
            version: 1,
          },
          null,
          2,
        )}\n`,
      );

      const firstCode = await main(["repo", "install", "--path", repoPath, "--json"], sink.io);
      expect(firstCode).toBe(0);
      expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
        check: false,
        ready: true,
        repoPath,
        results: [
          { harness_id: "lifecycle", integration: "hook-adapter", status: "created" },
          { harness_id: "claude-code", integration: "hooks", status: "updated" },
          { harness_id: "claude-code", integration: "mcp", status: "updated" },
          { harness_id: "codex", integration: "hook-features", status: "updated" },
          { harness_id: "codex", integration: "hooks", status: "updated" },
          { harness_id: "codex", integration: "mcp", status: "updated" },
        ],
      });

      const hookAdapterAfterFirstInstall = await readFile(
        join(repoPath, ".lifecycle", "hooks", "activity.sh"),
        "utf8",
      );
      const claudeAfterFirstInstall = await readFile(join(repoPath, ".claude", "settings.json"), "utf8");
      const jsonAfterFirstInstall = await readFile(join(repoPath, ".mcp.json"), "utf8");
      const tomlAfterFirstInstall = await readFile(join(repoPath, ".codex", "config.toml"), "utf8");
      const codexHooksAfterFirstInstall = await readFile(join(repoPath, ".codex", "hooks.json"), "utf8");

      const secondSink = createIo();
      const secondCode = await main(["repo", "install", "--path", repoPath, "--json"], secondSink.io);
      expect(secondCode).toBe(0);
      expect(JSON.parse(secondSink.stdout[0] ?? "null")).toMatchObject({
        results: [
          { harness_id: "lifecycle", integration: "hook-adapter", status: "unchanged" },
          { harness_id: "claude-code", integration: "hooks", status: "unchanged" },
          { harness_id: "claude-code", integration: "mcp", status: "unchanged" },
          { harness_id: "codex", integration: "hook-features", status: "unchanged" },
          { harness_id: "codex", integration: "hooks", status: "unchanged" },
          { harness_id: "codex", integration: "mcp", status: "unchanged" },
        ],
      });
      expect(await readFile(join(repoPath, ".lifecycle", "hooks", "activity.sh"), "utf8")).toBe(
        hookAdapterAfterFirstInstall,
      );
      expect(await readFile(join(repoPath, ".claude", "settings.json"), "utf8")).toBe(
        claudeAfterFirstInstall,
      );
      expect(await readFile(join(repoPath, ".mcp.json"), "utf8")).toBe(jsonAfterFirstInstall);
      expect(await readFile(join(repoPath, ".codex", "config.toml"), "utf8")).toBe(
        tomlAfterFirstInstall,
      );
      expect(await readFile(join(repoPath, ".codex", "hooks.json"), "utf8")).toBe(
        codexHooksAfterFirstInstall,
      );
    } finally {
      await rm(repoPath, { force: true, recursive: true });
    }
  });

  test("reports proxy install status as json", async () => {
    const sink = createIo();
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-proxy-status-"));

    try {
      const code = await withEnvironment(
        {
          LIFECYCLE_PROXY_INSTALL_STATE_PATH: join(dir, "install.json"),
        },
        async () => await main(["proxy", "status", "--json"], sink.io),
      );

      expect(code).toBe(1);
      expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
        currentPlatformSupported: process.platform === "darwin" || process.platform === "linux",
        installed: false,
        platform: process.platform,
      });
      expect(sink.stderr).toEqual([]);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  test("renders proxy install dry-run output as json", async () => {
    const sink = createIo();
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-proxy-install-"));

    try {
      const environment: Record<string, string> = {
        LIFECYCLE_PREVIEW_PROXY_PORT: "52444",
        LIFECYCLE_PROXY_INSTALL_STATE_PATH: join(dir, "install.json"),
      };

      let expectedActions: string[] = [];
      if (process.platform === "darwin") {
        const pfConfPath = join(dir, "pf.conf");
        await writeFile(pfConfPath, "scrub-anchor \"com.apple/*\"\n");
        environment.LIFECYCLE_PROXY_DARWIN_PF_CONF = pfConfPath;
        environment.LIFECYCLE_PROXY_DARWIN_ANCHOR_PATH = join(dir, "anchor.conf");
        environment.LIFECYCLE_PROXY_DARWIN_LAUNCH_DAEMON_PATH = join(dir, "launchd.plist");
        expectedActions = [
          `update ${pfConfPath}`,
          `write ${environment.LIFECYCLE_PROXY_DARWIN_ANCHOR_PATH}`,
          `write ${environment.LIFECYCLE_PROXY_DARWIN_LAUNCH_DAEMON_PATH}`,
        ];
      } else if (process.platform === "linux") {
        environment.LIFECYCLE_PROXY_LINUX_SERVICE_PATH = join(
          dir,
          "lifecycle-http-redirect.service",
        );
        expectedActions = [`write ${environment.LIFECYCLE_PROXY_LINUX_SERVICE_PATH}`];
      }

      const code = await withEnvironment(environment, async () =>
        main(["proxy", "install", "--dry-run", "--json"], sink.io),
      );

      if (process.platform === "darwin" || process.platform === "linux") {
        expect(code).toBe(0);
        expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
          actions: expectedActions,
          dryRun: true,
          mode: "clean-http",
          proxyPort: 52444,
        });
        expect(sink.stderr).toEqual([]);
      } else {
        expect(code).toBe(1);
        expect(sink.stdout).toEqual([]);
        expect(sink.stderr[0]).toContain(
          "lifecycle proxy install is currently supported on macOS and Linux only.",
        );
      }
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  test("initializes lifecycle.json from repo dev scripts", async () => {
    const sink = createIo();
    const repoPath = await mkdtemp(join(tmpdir(), "lifecycle-cli-init-"));

    try {
      await mkdir(join(repoPath, "apps", "control-plane"), { recursive: true });
      await mkdir(join(repoPath, "apps", "web"), { recursive: true });
      await writeFile(
        join(repoPath, "package.json"),
        JSON.stringify({
          name: "example-repo",
          packageManager: "bun@1.3.10",
          workspaces: ["apps/*"],
        }),
      );
      await writeFile(
        join(repoPath, "apps", "control-plane", "package.json"),
        JSON.stringify({
          name: "@example/control-plane",
          scripts: {
            dev: "bun run dev",
          },
        }),
      );
      await writeFile(
        join(repoPath, "apps", "web", "package.json"),
        JSON.stringify({
          name: "@example/web",
          scripts: {
            dev: "vite",
          },
        }),
      );

      const code = await withHttpBridge(
        async ({ method, pathname, body }) => {
          expect(method).toBe("POST");
          expect(pathname).toBe("/repos");
          expect(body).toMatchObject({
            path: repoPath,
            name: expect.any(String),
            rootWorkspace: {
              name: expect.any(String),
              sourceRef: expect.any(String),
              workspaceRoot: repoPath,
            },
          });

          return {
            body: {
              created: true,
              id: "repo_123",
            },
            status: 201,
          };
        },
        async () => await main(["repo", "init", "--path", repoPath, "--json"], sink.io),
      );

      expect(code).toBe(0);
      const manifestText = await readFile(join(repoPath, "lifecycle.json"), "utf8");
      const parsed = parseManifest(manifestText);
      expect(parsed.valid).toBe(true);

      if (!parsed.valid) {
        throw new Error("expected generated lifecycle.json to be valid");
      }

      expect(parsed.config.workspace.prepare).toMatchObject([
        {
          command: "bun install --frozen-lockfile",
          name: "install",
          timeout_seconds: 300,
        },
      ]);
      expect(parsed.config.stack).toMatchObject({
        "control-plane": {
          command: "bun run dev",
          cwd: "apps/control-plane",
          kind: "service",
          runtime: "process",
        },
        web: {
          command: "bun run dev",
          cwd: "apps/web",
          kind: "service",
          runtime: "process",
        },
      });

      expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
        manifestPath: join(repoPath, "lifecycle.json"),
        packageManager: "bun",
        services: [
          { cwd: "apps/control-plane", name: "control-plane" },
          { cwd: "apps/web", name: "web" },
        ],
      });
      expect(sink.stderr).toEqual([]);
    } finally {
      await rm(repoPath, { force: true, recursive: true });
    }
  });

  test("refuses to overwrite an existing lifecycle.json without force", async () => {
    const sink = createIo();
    const repoPath = await mkdtemp(join(tmpdir(), "lifecycle-cli-init-existing-"));

    try {
      await writeFile(join(repoPath, "lifecycle.json"), "{}\n");

      const code = await main(["repo", "init", "--path", repoPath], sink.io);

      expect(code).toBe(1);
      expect(sink.stdout).toEqual([]);
      expect(sink.stderr).toEqual([
        `Lifecycle found an existing manifest at ${join(repoPath, "lifecycle.json")}.`,
        "Suggested action: Re-run with --force to overwrite it, or edit the file manually.",
      ]);
    } finally {
      await rm(repoPath, { force: true, recursive: true });
    }
  });

  test("runs workspace.prepare steps locally", async () => {
    const sink = createIo();
    const repoPath = await mkdtemp(join(tmpdir(), "lifecycle-cli-prepare-"));

    try {
      await writeFile(
        join(repoPath, "lifecycle.json"),
        JSON.stringify({
          workspace: {
            prepare: [
              {
                name: "seed",
                command: "mkdir -p .generated && printf 'ok' > .generated/seed.txt",
                timeout_seconds: 30,
              },
              {
                name: "env",
                timeout_seconds: 30,
                write_files: [
                  {
                    lines: ["API_URL=http://localhost:3000", "MODE=dev"],
                    path: ".env.local",
                  },
                ],
              },
            ],
          },
          stack: {},
        }),
      );

      const code = await main(["prepare", "--path", repoPath, "--json"], sink.io);

      expect(code).toBe(0);
      expect(await readFile(join(repoPath, ".generated", "seed.txt"), "utf8")).toBe("ok");
      expect(await readFile(join(repoPath, ".env.local"), "utf8")).toBe(
        "API_URL=http://localhost:3000\nMODE=dev\n",
      );
      expect(JSON.parse(sink.stdout[0] ?? "null")).toMatchObject({
        manifestPath: join(repoPath, "lifecycle.json"),
        stepCount: 2,
        steps: [
          {
            command: "mkdir -p .generated && printf 'ok' > .generated/seed.txt",
            kind: "command",
            name: "seed",
          },
          {
            kind: "write_files",
            name: "env",
            writtenFiles: [join(repoPath, ".env.local")],
          },
        ],
        workspacePath: repoPath,
      });
      expect(sink.stderr).toEqual([]);
    } finally {
      await rm(repoPath, { force: true, recursive: true });
    }
  });

  test("returns an error for unknown commands", async () => {
    const sink = createIo();

    const code = await main(["service", "missing"], sink.io);

    expect(code).toBe(1);
    expect(sink.stderr).toEqual(["Unknown command: lifecycle service missing"]);
  });

  test("creates a plan through the desktop rpc", async () => {
    const sink = createIo();
    let receivedRequest: unknown = null;

    await withDesktopRpc(
      (request) => {
        receivedRequest = request;
        return {
          id: (request as { id: string }).id,
          method: "plan.create",
          ok: true,
          result: {
            plan: {
              id: "plan_001",
              repository_id: "project_123",
              workspace_id: null,
              name: "Auth Overhaul",
              description: "",
              body: "",
              status: "draft",
              position: 0,
              created_at: "2026-03-24T00:00:00.000Z",
              updated_at: "2026-03-24T00:00:00.000Z",
            },
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_DESKTOP_SOCKET: bridgePath,
            LIFECYCLE_WORKSPACE_ID: "ws_123",
          },
          async () =>
            await main(
              ["plan", "create", "--name", "Auth Overhaul", "--repository-id", "project_123"],
              sink.io,
            ),
        );

        expect(code).toBe(0);
      },
    );

    expect(receivedRequest).toMatchObject({
      method: "plan.create",
      params: {
        name: "Auth Overhaul",
        repositoryId: "project_123",
      },
    });
    expect(sink.stdout).toEqual(['Plan "Auth Overhaul" created (plan_001).']);
    expect(sink.stderr).toEqual([]);
  });

  test("creates a plan with json output", async () => {
    const sink = createIo();

    await withDesktopRpc(
      (request) => {
        return {
          id: (request as { id: string }).id,
          method: "plan.create",
          ok: true,
          result: {
            plan: {
              id: "plan_002",
              repository_id: "project_123",
              workspace_id: null,
              name: "Data Pipeline",
              description: "Rebuild the pipeline",
              body: "",
              status: "draft",
              position: 0,
              created_at: "2026-03-24T00:00:00.000Z",
              updated_at: "2026-03-24T00:00:00.000Z",
            },
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_DESKTOP_SOCKET: bridgePath,
          },
          async () =>
            await main(
              [
                "plan",
                "create",
                "--name",
                "Data Pipeline",
                "--repository-id",
                "project_123",
                "--description",
                "Rebuild the pipeline",
                "--json",
              ],
              sink.io,
            ),
        );

        expect(code).toBe(0);
      },
    );

    const output = JSON.parse(sink.stdout[0] ?? "null");
    expect(output.plan.id).toBe("plan_002");
    expect(output.plan.name).toBe("Data Pipeline");
    expect(sink.stderr).toEqual([]);
  });

  test("creates a task through the desktop rpc", async () => {
    const sink = createIo();
    let receivedRequest: unknown = null;

    await withDesktopRpc(
      (request) => {
        receivedRequest = request;
        return {
          id: (request as { id: string }).id,
          method: "task.create",
          ok: true,
          result: {
            task: {
              id: "task_001",
              plan_id: "plan_001",
              repository_id: "project_123",
              workspace_id: null,
              agent_id: null,
              name: "Write migration",
              description: "",
              status: "pending",
              priority: 3,
              position: 0,
              completed_at: null,
              created_at: "2026-03-24T00:00:00.000Z",
              updated_at: "2026-03-24T00:00:00.000Z",
            },
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_DESKTOP_SOCKET: bridgePath,
          },
          async () =>
            await main(
              [
                "task",
                "create",
                "--plan-id",
                "plan_001",
                "--repository-id",
                "project_123",
                "--name",
                "Write migration",
                "--priority",
                "high",
              ],
              sink.io,
            ),
        );

        expect(code).toBe(0);
      },
    );

    expect(receivedRequest).toMatchObject({
      method: "task.create",
      params: {
        planId: "plan_001",
        repositoryId: "project_123",
        name: "Write migration",
        priority: 3,
      },
    });
    expect(sink.stdout).toEqual(['Task "Write migration" created (task_001).']);
    expect(sink.stderr).toEqual([]);
  });

  test("adds a task dependency through the desktop rpc", async () => {
    const sink = createIo();
    let receivedRequest: unknown = null;

    await withDesktopRpc(
      (request) => {
        receivedRequest = request;
        return {
          id: (request as { id: string }).id,
          method: "task.dependency.add",
          ok: true,
          result: {},
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_DESKTOP_SOCKET: bridgePath,
          },
          async () =>
            await main(
              [
                "task",
                "dependency",
                "add",
                "--task-id",
                "task_002",
                "--depends-on",
                "task_001",
                "--repository-id",
                "project_123",
              ],
              sink.io,
            ),
        );

        expect(code).toBe(0);
      },
    );

    expect(receivedRequest).toMatchObject({
      method: "task.dependency.add",
      params: {
        taskId: "task_002",
        dependsOnTaskId: "task_001",
        repositoryId: "project_123",
      },
    });
    expect(sink.stdout).toEqual(["Dependency added: task_002 depends on task_001."]);
    expect(sink.stderr).toEqual([]);
  });
});
