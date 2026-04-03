import { createConnection } from "node:net";
import { execSync } from "node:child_process";

export interface TcpHealthCheck {
  kind: "tcp";
  host: string;
  port: number;
  timeoutSeconds: number;
}

export interface HttpHealthCheck {
  kind: "http";
  url: string;
  timeoutSeconds: number;
}

export interface ContainerHealthCheck {
  kind: "container";
  timeoutSeconds: number;
}

export type HealthCheck = TcpHealthCheck | HttpHealthCheck | ContainerHealthCheck;

function checkTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function checkHttp(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function checkContainer(containerRef: string): boolean {
  try {
    const result = execSync(
      `docker inspect --format '{{.State.Health.Status}}' ${containerRef}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    return result === "healthy";
  } catch {
    return false;
  }
}

async function checkHealth(
  check: HealthCheck,
  containerRef: string | null,
): Promise<boolean> {
  switch (check.kind) {
    case "tcp":
      return checkTcp(check.host, check.port, check.timeoutSeconds * 1000);
    case "http":
      return checkHttp(check.url, check.timeoutSeconds * 1000);
    case "container":
      return containerRef ? checkContainer(containerRef) : false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForHealth(
  check: HealthCheck,
  startupTimeoutSeconds: number,
  containerRef: string | null = null,
): Promise<void> {
  const deadline = Date.now() + startupTimeoutSeconds * 1000;
  const pollInterval = 1000;

  while (true) {
    if (await checkHealth(check, containerRef)) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Health check (${check.kind}) did not pass within ${startupTimeoutSeconds}s.`,
      );
    }
    await sleep(pollInterval);
  }
}
