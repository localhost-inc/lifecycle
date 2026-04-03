import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function withMockFetch<T>(
  handler: (input: Request | string | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("cloud CLI commands", () => {
  test("passes PR create fields through to the API", async () => {
    const sink = createIo();
    let requestBody: unknown;
    let requestUrl = "";

    await withTempHome(async () =>
      await withEnvironment({ LIFECYCLE_API_URL: "https://api.lifecycle.test" }, async () =>
        await withMockFetch(async (input, init) => {
          requestUrl = String(input);
          requestBody = JSON.parse(String(init?.body ?? "{}"));

          return new Response(
            JSON.stringify({
              number: 42,
              url: "https://github.com/acme/repo/pull/42",
              headBranch: "feature/branch",
              baseBranch: "develop",
            }),
            {
              headers: { "content-type": "application/json" },
              status: 201,
            },
          );
        }, async () => {
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
        }),
      ),
    );

    expect(requestUrl).toBe("https://api.lifecycle.test/workspaces/ws_123/pr");
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
    let requestUrl = "";

    await withTempHome(async () =>
      await withEnvironment({ LIFECYCLE_API_URL: "https://api.lifecycle.test" }, async () =>
        await withMockFetch(async (input, init) => {
          requestUrl = String(input);
          requestBody = JSON.parse(String(init?.body ?? "{}"));

          return new Response(
            JSON.stringify({
              command: ["git", "status"],
              cwd: "/workspace",
              exitCode: 3,
              output: "out\nerr\n",
              stderr: "err\n",
              stdout: "out\n",
            }),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          );
        }, async () => {
          const code = await main(
            ["workspace", "exec", "ws_123", "--", "git", "status"],
            sink.io,
          );

          expect(code).toBe(3);
        }),
      ),
    );

    expect(requestUrl).toBe("https://api.lifecycle.test/workspaces/ws_123/exec");
    expect(requestBody).toEqual({ command: ["git", "status"] });
    expect(sink.stdout).toEqual(["out"]);
    expect(sink.stderr).toEqual(["err"]);
  });

  test("resolves workspace shell through the cloud workspace client runtime", async () => {
    const sink = createIo();
    const requestUrls: string[] = [];

    await withTempHome(async () =>
      await withEnvironment({ LIFECYCLE_API_URL: "https://api.lifecycle.test" }, async () =>
        await withMockFetch(async (input) => {
          requestUrls.push(String(input));

          return new Response(
            JSON.stringify({
              cwd: "/workspace/repo",
              home: "/home/lifecycle",
              host: "ssh.app.lifecycle.test",
              token: "tok_123",
            }),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          );
        }, async () => {
          const code = await main(
            ["workspace", "shell", "ws_cloud_123", "--json"],
            sink.io,
          );

          expect(code).toBe(0);
        }),
      ),
    );

    expect(requestUrls).toEqual([
      "https://api.lifecycle.test/workspaces/ws_cloud_123/shell",
    ]);
    expect(JSON.parse(sink.stdout.join("\n"))).toEqual({
      workspace: {
        host: "cloud",
        id: "ws_cloud_123",
        worktreePath: null,
      },
      shell: {
        backendLabel: "cloud shell",
        launchError: null,
        persistent: false,
        sessionName: null,
        prepare: expect.any(Object),
        spec: {
          program: "ssh",
          args: [
            "-tt",
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            "UserKnownHostsFile=/dev/null",
            "-o",
            "LogLevel=ERROR",
            "tok_123@ssh.app.lifecycle.test",
          ],
          cwd: null,
          env: [],
        },
      },
    });
  });
});
