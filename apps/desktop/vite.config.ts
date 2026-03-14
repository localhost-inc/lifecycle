import { execFile } from "node:child_process";
import { promisify } from "node:util";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const host = process.env.TAURI_DEV_HOST;
const execFileAsync = promisify(execFile);
const DEV_AUTH_SESSION_ENDPOINT = "/__dev/auth/session";
const GITHUB_HOST = "github.com";

interface GhAuthStatusAccount {
  active?: boolean;
  login?: string;
  state?: string;
}

interface GhAuthStatusResponse {
  hosts?: Record<string, GhAuthStatusAccount[] | undefined>;
}

interface GitHubViewerResponse {
  avatar_url?: string | null;
  login?: string | null;
  name?: string | null;
}

interface DevAuthSession {
  identity: {
    avatarUrl: string | null;
    displayName: string;
    handle: string | null;
  } | null;
  message: string | null;
  provider: "github" | null;
  source: "local_cli" | null;
  state: "logged_in" | "logged_out";
}

function buildLoggedOutDevAuthSession(message: string | null = null): DevAuthSession {
  return {
    identity: null,
    message,
    provider: "github",
    source: "local_cli",
    state: "logged_out",
  };
}

function trimMessage(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readExecMessage(error: unknown): string | null {
  if (error && typeof error === "object") {
    const execError = error as { stderr?: string | null; stdout?: string | null; message?: string };
    return (
      trimMessage(execError.stderr) ??
      trimMessage(execError.stdout) ??
      trimMessage(execError.message) ??
      null
    );
  }

  return null;
}

async function readLocalDevAuthSession(): Promise<DevAuthSession> {
  let authStatusRaw: string;

  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["auth", "status", "--hostname", GITHUB_HOST, "--json", "hosts"],
      {
        encoding: "utf8",
      },
    );
    authStatusRaw = stdout;
  } catch (error) {
    return buildLoggedOutDevAuthSession(
      readExecMessage(error) ?? "GitHub CLI is unavailable in local development.",
    );
  }

  let authStatus: GhAuthStatusResponse;
  try {
    authStatus = JSON.parse(authStatusRaw) as GhAuthStatusResponse;
  } catch (error) {
    return buildLoggedOutDevAuthSession(
      error instanceof Error ? `Failed to parse GitHub auth status: ${error.message}` : null,
    );
  }

  const activeLogin =
    authStatus.hosts?.[GITHUB_HOST]?.find(
      (account) => account?.active && account.state === "success",
    )?.login ?? null;

  if (!activeLogin) {
    return buildLoggedOutDevAuthSession("GitHub CLI is not authenticated locally.");
  }

  let viewerRaw: string;
  try {
    const { stdout } = await execFileAsync("gh", ["api", "--hostname", GITHUB_HOST, "user"], {
      encoding: "utf8",
    });
    viewerRaw = stdout;
  } catch (error) {
    return {
      identity: {
        avatarUrl: null,
        displayName: activeLogin,
        handle: activeLogin,
      },
      message: readExecMessage(error) ?? "GitHub profile details are unavailable.",
      provider: "github",
      source: "local_cli",
      state: "logged_in",
    };
  }

  let viewer: GitHubViewerResponse;
  try {
    viewer = JSON.parse(viewerRaw) as GitHubViewerResponse;
  } catch (error) {
    return {
      identity: {
        avatarUrl: null,
        displayName: activeLogin,
        handle: activeLogin,
      },
      message:
        error instanceof Error ? `Failed to parse GitHub profile details: ${error.message}` : null,
      provider: "github",
      source: "local_cli",
      state: "logged_in",
    };
  }

  const handle = trimMessage(viewer.login) ?? activeLogin;
  const displayName = trimMessage(viewer.name) ?? handle;

  return {
    identity: {
      avatarUrl: trimMessage(viewer.avatar_url ?? undefined),
      displayName,
      handle,
    },
    message: null,
    provider: "github",
    source: "local_cli",
    state: "logged_in",
  };
}

function localDevAuthPlugin(): Plugin {
  return {
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestPath = request.url?.split("?")[0];
        if (requestPath !== DEV_AUTH_SESSION_ENDPOINT) {
          next();
          return;
        }

        if (request.method && request.method !== "GET") {
          response.statusCode = 405;
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.end("Method not allowed.");
          return;
        }

        try {
          const session = await readLocalDevAuthSession();
          response.statusCode = 200;
          response.setHeader("cache-control", "no-store");
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify(session));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("cache-control", "no-store");
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.end(error instanceof Error ? error.message : "Failed to resolve auth session.");
        }
      });
    },
    name: "lifecycle-local-dev-auth",
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localDevAuthPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: ["es2021", "chrome105", "safari13"],
  },
});
