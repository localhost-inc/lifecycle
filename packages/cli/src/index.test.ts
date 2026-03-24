import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

async function withBridge<T>(
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

describe("lifecycle cli", () => {
  test("prints dynamic root help with no args", async () => {
    const sink = createIo();

    const code = await main([], sink.io);

    expect(code).toBe(0);
    expect(sink.stdout[0]).toContain("Usage: lifecycle <command> [flags]");
    expect(sink.stdout[0]).toContain("browser");
    expect(sink.stdout[0]).toContain("context");
    expect(sink.stdout[0]).toContain("project");
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
    await withBridge(
      (request) => {
        expect(request).toMatchObject({
          method: "tab.open",
          params: {
            surface: "preview",
            url: "http://localhost:3000",
            workspaceId: "ws_123",
          },
          session: {
            terminalId: "term_123",
            token: "session-token",
          },
        });

        return {
          id: (request as { id: string }).id,
          method: "tab.open",
          ok: true,
          result: {
            projectId: "project_123",
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
            LIFECYCLE_BRIDGE: bridgePath,
            LIFECYCLE_BRIDGE_SESSION_TOKEN: "session-token",
            LIFECYCLE_TERMINAL_ID: "term_123",
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
    await withBridge(
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
            projectId: "project_123",
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
            LIFECYCLE_BRIDGE: bridgePath,
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

  test("parses service info positional arguments", async () => {
    const sink = createIo();
    await withBridge(
      (request) => {
        expect(request).toMatchObject({
          method: "service.info",
          params: {
            service: "api",
            workspaceId: "ws_123",
          },
        });

        return {
          id: (request as { id: string }).id,
          method: "service.info",
          ok: true,
          result: {
            service: {
              assigned_port: 3000,
              created_at: "2026-03-21T00:00:00.000Z",
              id: "svc_123",
              name: "api",
              preview_url: "http://api.lifecycle.localhost",
              status: "ready",
              status_reason: null,
              updated_at: "2026-03-21T00:00:00.000Z",
              workspace_id: "ws_123",
            },
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_BRIDGE: bridgePath,
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
      "preview: http://api.lifecycle.localhost",
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("lists services through the bridge", async () => {
    const sink = createIo();
    await withBridge(
      (request) => {
        expect(request).toMatchObject({
          method: "service.list",
          params: {
            workspaceId: "ws_123",
          },
        });

        return {
          id: (request as { id: string }).id,
          method: "service.list",
          ok: true,
          result: {
            services: [
              {
                assigned_port: 3000,
                created_at: "2026-03-21T00:00:00.000Z",
                id: "svc_123",
                name: "api",
                preview_url: "http://api.lifecycle.localhost",
                status: "ready",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
              {
                assigned_port: 6379,
                created_at: "2026-03-21T00:00:00.000Z",
                id: "svc_456",
                name: "redis",
                preview_url: null,
                status: "starting",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_BRIDGE: bridgePath,
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
      "preview: http://api.lifecycle.localhost",
      "",
      "redis",
      "status: starting",
      "port: 6379",
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("starts services through the bridge", async () => {
    const sink = createIo();
    const worktreePath = await mkdtemp(join(tmpdir(), "lifecycle-cli-worktree-"));
    let receivedRequest: unknown = null;

    await mkdir(worktreePath, { recursive: true });
    await writeFile(
      join(worktreePath, "lifecycle.json"),
      JSON.stringify({
        environment: {
          api: {
            command: "bun run dev",
            kind: "service",
            runtime: "process",
          },
        },
        workspace: {
          prepare: [],
        },
      }),
    );

    try {
      await withBridge(
        (request) => {
          receivedRequest = request;
          return {
            id: (request as { id: string }).id,
            method: "service.start",
            ok: true,
            result: {
              services: [
                {
                  assigned_port: 3000,
                  created_at: "2026-03-21T00:00:00.000Z",
                  id: "svc_123",
                  name: "api",
                  preview_url: "http://api.lifecycle.localhost",
                  status: "ready",
                  status_reason: null,
                  updated_at: "2026-03-21T00:00:00.000Z",
                  workspace_id: "ws_123",
                },
              ],
              startedServices: ["api"],
              workspaceId: "ws_123",
            },
          };
        },
        async (bridgePath) => {
          const code = await withEnvironment(
            {
              LIFECYCLE_BRIDGE: bridgePath,
              LIFECYCLE_WORKSPACE_ID: "ws_123",
              LIFECYCLE_WORKSPACE_PATH: worktreePath,
            },
            async () => await main(["service", "start", "api"], sink.io),
          );

          expect(code).toBe(0);
        },
      );

      expect(receivedRequest).toMatchObject({
        method: "service.start",
        params: {
          serviceNames: ["api"],
          workspaceId: "ws_123",
        },
      });
      expect(
        (receivedRequest as { params: { manifestFingerprint: string } }).params.manifestFingerprint,
      ).not.toHaveLength(0);
      expect(
        JSON.parse((receivedRequest as { params: { manifestJson: string } }).params.manifestJson),
      ).toMatchObject({
        environment: {
          api: {
            command: "bun run dev",
            kind: "service",
            runtime: "process",
          },
        },
      });
      expect(sink.stdout).toEqual([
        "Started services: api",
        "api",
        "status: ready",
        "port: 3000",
        "preview: http://api.lifecycle.localhost",
      ]);
      expect(sink.stderr).toEqual([]);
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });

  test("prints structured context by default", async () => {
    const sink = createIo();
    await withBridge(
      (request) => {
        expect(request).toMatchObject({
          method: "context.read",
          params: {
            workspaceId: "ws_123",
          },
          session: {
            terminalId: "term_123",
            token: "session-token",
          },
        });

        return {
          id: (request as { id: string }).id,
          method: "context.read",
          ok: true,
          result: {
            capabilities: {
              browser: {
                reload: false,
                snapshot: false,
              },
              cliInstalled: true,
              context: true,
              service: {
                health: false,
                info: true,
                list: true,
                logs: false,
                set: false,
                start: true,
                stop: false,
              },
              tab: {
                commitDiff: false,
                file: false,
                preview: true,
                pullRequest: false,
                terminal: false,
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
              "lifecycle tab open --surface preview --url <url>",
            ],
            bridge: {
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
              shellBridge: true,
            },
            session: {
              terminalId: "term_123",
              workspaceId: "ws_123",
            },
            services: [
              {
                assigned_port: 3000,
                created_at: "2026-03-21T00:00:00.000Z",
                id: "svc_123",
                name: "api",
                preview_url: "http://api.lifecycle.localhost",
                status: "ready",
                status_reason: null,
                updated_at: "2026-03-21T00:00:00.000Z",
                workspace_id: "ws_123",
              },
            ],
            terminals: [
              {
                created_by: null,
                ended_at: null,
                exit_code: null,
                failure_reason: null,
                harness_provider: "codex",
                harness_session_id: "codex-session-1",
                id: "term_123",
                label: "Codex 1",
                last_active_at: "2026-03-21T00:00:00.000Z",
                launch_type: "harness",
                started_at: "2026-03-21T00:00:00.000Z",
                status: "active",
                workspace_id: "ws_123",
              },
            ],
            workspace: {
              checkout_type: "worktree",
              created_at: "2026-03-21T00:00:00.000Z",
              created_by: null,
              expires_at: null,
              failed_at: null,
              failure_reason: null,
              git_sha: "abc123",
              id: "ws_123",
              last_active_at: "2026-03-21T00:00:00.000Z",
              manifest_fingerprint: "manifest_123",
              name: "Feature Workspace",
              prepared_at: "2026-03-21T00:00:00.000Z",
              project_id: "project_123",
              source_ref: "feat/cli",
              source_workspace_id: null,
              status: "active",
              target: "local",
              updated_at: "2026-03-21T00:00:00.000Z",
              worktree_path: "/repo/.worktrees/ws_123",
            },
          },
        };
      },
      async (bridgePath) => {
        const code = await withEnvironment(
          {
            LIFECYCLE_BRIDGE: bridgePath,
            LIFECYCLE_BRIDGE_SESSION_TOKEN: "session-token",
            LIFECYCLE_TERMINAL_ID: "term_123",
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
      bridge: {
        available: true,
        session: true,
      },
      environment: {
        healthy: true,
        readyServiceCount: 1,
        totalServiceCount: 1,
      },
      session: {
        terminalId: "term_123",
        workspaceId: "ws_123",
      },
      provider: {
        name: "local",
        shellBridge: true,
      },
      workspace: {
        id: "ws_123",
        project_id: "project_123",
      },
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

  test("returns an error for unknown commands", async () => {
    const sink = createIo();

    const code = await main(["service", "missing"], sink.io);

    expect(code).toBe(1);
    expect(sink.stderr).toEqual(["Unknown command: lifecycle service missing"]);
  });
});
