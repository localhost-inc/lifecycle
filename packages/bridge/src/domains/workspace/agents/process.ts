import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

interface SpawnAgentWorkerInput {
  args: string[];
  binary?: string;
  cwd?: string | null;
  detached?: boolean;
  env?: Record<string, string>;
  stdio: "ignore" | ["ignore", "pipe", "pipe"] | ["pipe", "pipe", "pipe"];
}

export function resolveAgentWorkerEntrypoint(): { binary: string; argsPrefix: string[] } {
  const currentModulePath = fileURLToPath(import.meta.url);
  const extension = extname(currentModulePath) || ".ts";
  const workerPath = fileURLToPath(new URL(`./worker${extension}`, import.meta.url));

  if (!existsSync(workerPath)) {
    throw new Error(
      `Lifecycle bridge could not resolve the agent worker entrypoint: ${workerPath}`,
    );
  }

  return {
    binary: process.execPath,
    argsPrefix: [workerPath],
  };
}

export function spawnAgentWorker(input: SpawnAgentWorkerInput) {
  const worker = input.binary
    ? { argsPrefix: [], binary: input.binary }
    : resolveAgentWorkerEntrypoint();

  return spawn(worker.binary, [...worker.argsPrefix, ...input.args], {
    ...(input.cwd !== undefined && input.cwd !== null ? { cwd: input.cwd } : {}),
    detached: input.detached ?? false,
    ...(input.env ? { env: { ...process.env, ...input.env } } : { env: process.env }),
    stdio: input.stdio,
  });
}
