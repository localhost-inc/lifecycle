import { spawn } from "node:child_process";
import { hc } from "hono/client";
import type { AppType } from "../../routed.gen";
import { readBridgeRegistration } from "./registration";

const STARTUP_ATTEMPTS = 120;
const STARTUP_WAIT_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const payload = (await response.json()) as { healthy?: boolean };
    return payload.healthy === true;
  } catch {
    return false;
  }
}

function spawnBridge(): void {
  const script = process.argv[1];
  if (!script) {
    throw new Error("Could not resolve CLI entrypoint to start bridge.");
  }

  const child = spawn(process.execPath, [script, "bridge", "start"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

function createBridgeFetch() {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const response = await fetch(input, init);
    if (response.ok) {
      return response;
    }

    const message = formatBridgeFailure(response.status, await response.text().catch(() => ""));

    throw new Error(message);
  };
}

type BridgeErrorEnvelope =
  | {
      error: string;
      target?: string;
      issues?: Array<{ message?: string; path?: Array<string | number> }>;
    }
  | { error: { message?: string } };

export function formatBridgeFailure(status: number, body: string): string {
  const payload = parseBridgeFailure(body);
  if (payload) {
    return payload;
  }

  const rawBody = body.trim();
  if (!rawBody) {
    return `Bridge request failed with status ${status}.`;
  }

  return `Bridge request failed with status ${status}: ${rawBody}`;
}

function parseBridgeFailure(body: string): string | null {
  if (!body.trim()) {
    return null;
  }

  let payload: BridgeErrorEnvelope;
  try {
    payload = JSON.parse(body) as BridgeErrorEnvelope;
  } catch {
    return null;
  }
  if (typeof payload.error === "string") {
    const target =
      "target" in payload && typeof payload.target === "string" ? payload.target : null;
    const issues =
      "issues" in payload && Array.isArray(payload.issues)
        ? formatBridgeIssues(payload.issues)
        : "";
    const prefix = target ? `Bridge ${target} validation failed` : "Bridge request failed";
    return issues ? `${prefix}: ${issues}` : `${prefix}: ${payload.error}`;
  }

  if (
    typeof payload.error === "object" &&
    payload.error !== null &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim()
  ) {
    return payload.error.message;
  }

  return null;
}

function formatBridgeIssues(
  issues: Array<{ message?: string; path?: Array<string | number> }>,
): string {
  return issues
    .flatMap((issue) => {
      if (typeof issue.message !== "string" || !issue.message.trim()) {
        return [];
      }

      const path = Array.isArray(issue.path) ? formatBridgeIssuePath(issue.path) : "";
      return [path ? `${path}: ${issue.message}` : issue.message];
    })
    .join("; ");
}

function formatBridgeIssuePath(path: Array<string | number>): string {
  let formatted = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      formatted += `[${segment}]`;
      continue;
    }

    if (formatted) {
      formatted += ".";
    }
    formatted += segment;
  }
  return formatted;
}

export type BridgeClient = ReturnType<typeof hc<AppType>>;

function defaultPortForProtocol(protocol: string): number {
  return protocol === "https:" ? 443 : 80;
}

export function createBridgeClient(baseUrl: string): BridgeClient {
  return hc<AppType>(baseUrl, {
    fetch: createBridgeFetch() as typeof fetch,
  });
}

export async function ensureBridge(): Promise<{ port: number; client: BridgeClient }> {
  const explicitBridgeUrl = process.env.LIFECYCLE_BRIDGE_URL;
  if (explicitBridgeUrl) {
    const url = new URL(explicitBridgeUrl);
    return {
      port: url.port ? Number.parseInt(url.port, 10) : defaultPortForProtocol(url.protocol),
      client: createBridgeClient(explicitBridgeUrl),
    };
  }

  const existing = await readBridgeRegistration();
  if (existing && (await isHealthy(existing.port))) {
    return { port: existing.port, client: createBridgeClient(`http://127.0.0.1:${existing.port}`) };
  }

  spawnBridge();

  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt++) {
    await sleep(STARTUP_WAIT_MS);
    const registration = await readBridgeRegistration();
    if (registration && (await isHealthy(registration.port))) {
      return {
        port: registration.port,
        client: createBridgeClient(`http://127.0.0.1:${registration.port}`),
      };
    }
  }

  throw new Error("Bridge failed to start within the timeout.");
}
