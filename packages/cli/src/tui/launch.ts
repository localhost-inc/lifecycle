import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { CliIo } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";

function findTuiBinary(): string | null {
  const cliDir = dirname(dirname(import.meta.dir));
  const repoRoot = resolve(cliDir, "../..");

  for (const profile of ["release", "debug"]) {
    const candidates = [
      resolve(repoRoot, "target", profile, "lifecycle-tui"),
      resolve(repoRoot, "apps/tui/target", profile, "lifecycle-tui"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function currentCliEntrypoint(): string | null {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return null;
  }
  return resolve(entrypoint);
}

export async function launchTui(
  input: {
    cwd?: string;
    env: NodeJS.ProcessEnv;
    workspaceId?: string;
  },
  io?: CliIo,
): Promise<number> {
  const stderr = io?.stderr ?? ((message: string) => console.error(message));
  const binary = findTuiBinary();
  if (!binary) {
    stderr("TUI binary not found. Run `cargo build` in apps/tui/ first.");
    return 1;
  }

  const { port } = await ensureBridge();
  const cliEntrypoint = currentCliEntrypoint();

  const result = spawnSync(binary, {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    stdio: "inherit",
    env: {
      ...input.env,
      LIFECYCLE_BRIDGE_URL: `http://127.0.0.1:${port}`,
      LIFECYCLE_BRIDGE_CLI_RUNTIME: process.execPath,
      ...(cliEntrypoint ? { LIFECYCLE_BRIDGE_CLI_ENTRYPOINT: cliEntrypoint } : {}),
      ...(input.workspaceId ? { LIFECYCLE_INITIAL_WORKSPACE_ID: input.workspaceId } : {}),
    },
  });

  return result.status ?? 1;
}
