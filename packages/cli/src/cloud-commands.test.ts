import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
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

async function withTempHome<T>(run: () => Promise<T>): Promise<T> {
  const homeDir = await mkdtemp(join(tmpdir(), "lifecycle-cli-home-"));

  try {
    await mkdir(join(homeDir, ".lifecycle"), { recursive: true });
    await writeFile(
      join(homeDir, ".lifecycle", "credentials.json"),
      JSON.stringify({
        token: "test-token",
        userId: "user_123",
        email: "user@example.com",
        displayName: "Test User",
        activeOrgId: "org_123",
        activeOrgSlug: "personal",
        accessToken: null,
        refreshToken: null,
      }),
      "utf8",
    );

    return await withEnvironment({ HOME: homeDir }, run);
  } finally {
    await rm(homeDir, { force: true, recursive: true });
  }
}

async function withMockBridge<T>(
  handler: (request: {
    body: unknown;
    method: string;
    pathname: string;
    search: URLSearchParams;
  }) => Promise<{ body: unknown; status?: number } | unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    throw new Error("HOME must be set before starting the mock bridge.");
  }

  const server = createServer(async (request, response) => {
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
  }
}

describe("cloud CLI commands", () => {
  test("passes PR create fields through to the bridge", async () => {
    const sink = createIo();
    let requestBody: unknown;
    let requestMethod = "";
    let requestPath = "";

    await withTempHome(
      async () =>
        await withMockBridge(
          async ({ body, method, pathname }) => {
            requestMethod = method;
            requestPath = pathname;
            requestBody = body;

            return {
              body: {
                number: 42,
                url: "https://github.com/acme/repo/pull/42",
                headBranch: "feature/branch",
                baseBranch: "develop",
              },
              status: 201,
            };
          },
          async () => {
            const code = await main(
              [
                "pr",
                "create",
                "--workspace-id",
                "ws_123",
                "--title",
                "Cloud PR",
                "--body",
                "Ready for review",
                "--base-branch",
                "develop",
              ],
              sink.io,
            );

            expect(code).toBe(0);
          },
        ),
    );

    expect(requestMethod).toBe("POST");
    expect(requestPath).toBe("/workspaces/ws_123/pr");
    expect(requestBody).toEqual({
      baseBranch: "develop",
      body: "Ready for review",
      title: "Cloud PR",
    });
    expect(sink.stdout).toEqual([
      "PR #42 created.",
      "url: https://github.com/acme/repo/pull/42",
      "feature/branch -> develop",
    ]);
    expect(sink.stderr).toEqual([]);
  });

  test("returns workspace exec exit code and prints command output", async () => {
    const sink = createIo();
    let requestBody: unknown;
    let requestMethod = "";
    let requestPath = "";

    await withTempHome(
      async () =>
        await withMockBridge(
          async ({ body, method, pathname }) => {
            requestMethod = method;
            requestPath = pathname;
            requestBody = body;

            return {
              body: {
                command: ["git", "status"],
                cwd: "/workspace",
                exitCode: 3,
                output: "out\nerr\n",
                stderr: "err\n",
                stdout: "out\n",
              },
            };
          },
          async () => {
            const code = await main(
              ["workspace", "exec", "ws_123", "--", "git", "status"],
              sink.io,
            );

            expect(code).toBe(3);
          },
        ),
    );

    expect(requestMethod).toBe("POST");
    expect(requestPath).toBe("/workspaces/ws_123/exec");
    expect(requestBody).toEqual({ command: ["git", "status"] });
    expect(sink.stdout).toEqual(["out"]);
    expect(sink.stderr).toEqual(["err"]);
  });

  test("resolves workspace shell through the cloud workspace client runtime", async () => {
    const sink = createIo();
    const requests: Array<{ method: string; pathname: string }> = [];

    await withTempHome(
      async () =>
        await withMockBridge(
          async ({ method, pathname }) => {
            requests.push({ method, pathname });

            return {
              body: {
                workspace: {
                  binding: "bound",
                  workspace_id: "ws_cloud_123",
                  workspace_name: "Cloud Workspace",
                  repo_name: "example-repo",
                  host: "cloud",
                  status: "active",
                  source_ref: "feature/branch",
                  cwd: null,
                  workspace_root: null,
                  resolution_note: null,
                  resolution_error: null,
                },
                shell: {
                  backend_label: "cloud shell",
                  launch_error: null,
                  persistent: false,
                  session_name: null,
                  prepare: null,
                  spec: {
                    program: "ssh",
                    args: ["tok_123@ssh.app.lifecycle.test"],
                    cwd: null,
                    env: [],
                  },
                },
              },
            };
          },
          async () => {
            const code = await main(["workspace", "shell", "ws_cloud_123", "--json"], sink.io);

            expect(code).toBe(0);
          },
        ),
    );

    expect(requests).toEqual([{ method: "POST", pathname: "/workspaces/ws_cloud_123/shell" }]);
    expect(JSON.parse(sink.stdout.join("\n"))).toEqual({
      workspace: {
        binding: "bound",
        workspace_id: "ws_cloud_123",
        workspace_name: "Cloud Workspace",
        repo_name: "example-repo",
        host: "cloud",
        status: "active",
        source_ref: "feature/branch",
        cwd: null,
        workspace_root: null,
        resolution_note: null,
        resolution_error: null,
      },
      shell: {
        backend_label: "cloud shell",
        launch_error: null,
        persistent: false,
        session_name: null,
        prepare: null,
        spec: {
          program: "ssh",
          args: ["tok_123@ssh.app.lifecycle.test"],
          cwd: null,
          env: [],
        },
      },
    });
  });
});
