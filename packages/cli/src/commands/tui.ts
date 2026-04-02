import { defineCommand } from "@lifecycle/cmd";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { z } from "zod";
import { resolveTuiSession } from "../tui-session";

/** Walk up from the CLI package to find the TUI binary in the workspace. */
function findTuiBinary(): string | null {
  // In development: relative to this file → apps/tui/target/debug/lifecycle-tui
  // In release:      relative to this file → apps/tui/target/release/lifecycle-tui
  const cliDir = dirname(dirname(import.meta.dir)); // packages/cli → repo root (../../)
  const repoRoot = resolve(cliDir, "../..");

  for (const profile of ["release", "debug"]) {
    const candidate = resolve(repoRoot, "apps/tui/target", profile, "lifecycle-tui");
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export default defineCommand({
  description: "Launch the Lifecycle TUI.",
  input: z.object({
    args: z.array(z.string()).optional().describe("[workspace]"),
    cwd: z.string().optional().describe("Bind ad hoc local mode to this working directory."),
  }),
  run: async (input, context) => {
    const binary = findTuiBinary();
    if (!binary) {
      context.stderr(
        "TUI binary not found. Run `cargo build` in apps/tui/ first.",
      );
      return 1;
    }

    const workspaceId = input.args?.[0];
    const session = await resolveTuiSession({
      env: process.env,
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...(workspaceId ? { workspaceId } : {}),
    });

    const result = spawnSync(binary, {
      stdio: "inherit",
      env: {
        ...process.env,
        ...(workspaceId ? { LIFECYCLE_TUI_WORKSPACE_ID: workspaceId } : {}),
        ...(input.cwd ? { LIFECYCLE_TUI_WORKSPACE_CWD: input.cwd } : {}),
        LIFECYCLE_TUI_SESSION: JSON.stringify(session),
      },
    });

    return result.status ?? 1;
  },
});
