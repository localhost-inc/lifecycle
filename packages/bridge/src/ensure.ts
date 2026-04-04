import { spawn } from "node:child_process";
import { hc } from "hono/client";
import type { AppType } from "../routed.gen";
import { readPidfile } from "./pidfile";

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

    const payload = await response.json().catch(() => null);
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : `Bridge error ${response.status}`;

    throw new Error(message);
  };
}

export type BridgeClient = ReturnType<typeof hc<AppType>>;

export function createBridgeClient(port: number): BridgeClient {
  return hc<AppType>(`http://127.0.0.1:${port}`, {
    fetch: createBridgeFetch() as typeof fetch,
  });
}

export async function ensureBridge(): Promise<{ port: number; client: BridgeClient }> {
  const existing = await readPidfile();
  if (existing && (await isHealthy(existing.port))) {
    return { port: existing.port, client: createBridgeClient(existing.port) };
  }

  spawnBridge();

  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt++) {
    await sleep(STARTUP_WAIT_MS);
    const pidfile = await readPidfile();
    if (pidfile && (await isHealthy(pidfile.port))) {
      return { port: pidfile.port, client: createBridgeClient(pidfile.port) };
    }
  }

  throw new Error("Bridge failed to start within the timeout.");
}
