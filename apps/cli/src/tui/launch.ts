import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { CliIo } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";

function findTuiBinary(environment: NodeJS.ProcessEnv = process.env): string | null {
  const explicitPath = environment.LIFECYCLE_CLI_TUI_PATH?.trim();
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const packagedCandidates = [
    resolve(dirname(process.execPath), "lifecycle-tui"),
    resolve(dirname(process.execPath), "../Resources/lifecycle-tui"),
    resolve(dirname(process.execPath), "../Resources/lifecycle-runtime/tui/lifecycle-tui"),
  ];

  for (const candidate of packagedCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

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
  const binary = findTuiBinary(input.env);
  if (!binary) {
    stderr(
      "TUI binary not found. Set LIFECYCLE_CLI_TUI_PATH or build lifecycle-tui for local development.",
    );
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
