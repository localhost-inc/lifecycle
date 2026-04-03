import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { declaredServiceNames, isPidAlive, killPid } from "@lifecycle/stack";

import { loadManifest } from "../../manifest";
import { failCommand, jsonFlag } from "../_shared";

function lifecycleStatePath(): string {
  const root = process.env.LIFECYCLE_ROOT ?? resolve(process.env.HOME ?? "/tmp", ".lifecycle");
  return resolve(root, "state", "stacks");
}

function readPidFile(stateDir: string, service: string): number | null {
  try {
    const content = readFileSync(resolve(stateDir, `${service}.pid`), "utf8").trim();
    const pid = Number.parseInt(content, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function cleanStateFiles(stateDir: string, service: string): void {
  try { unlinkSync(resolve(stateDir, `${service}.pid`)); } catch {}
  try { unlinkSync(resolve(stateDir, `${service}.port`)); } catch {}
}

export default defineCommand({
  description: "Stop environment services for the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Optional service names to stop (stops all if omitted)."),
    cwd: z.string().optional().describe("Workspace directory (defaults to current directory)."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const searchFrom = input.cwd ?? process.cwd();
      const manifest = await loadManifest({ searchFrom });
      const allServices = declaredServiceNames(manifest.config);
      const workspaceId = manifest.workspacePath;
      const stateDir = resolve(lifecycleStatePath(), encodeURIComponent(workspaceId));

      const targetServices = input.args.length > 0 ? input.args : allServices;
      const stopped: string[] = [];

      for (const name of targetServices) {
        const pid = readPidFile(stateDir, name);
        if (pid !== null && isPidAlive(pid)) {
          killPid(pid);
          stopped.push(name);
          if (!input.json) {
            context.stdout(`Stopped ${name} (pid ${pid})`);
          }
        }
        cleanStateFiles(stateDir, name);
      }

      if (stopped.length === 0 && !input.json) {
        context.stdout("No running services to stop.");
      }

      if (input.json) {
        context.stdout(JSON.stringify({ stopped }, null, 2));
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
