import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { declaredServiceNames } from "@lifecycle/stack";
import { isPidAlive } from "@lifecycle/stack";

import { loadManifest } from "../../manifest";
import { failCommand, jsonFlag } from "../_shared";

function lifecycleStatePath(): string {
  const root = process.env.LIFECYCLE_ROOT ?? resolve(process.env.HOME ?? "/tmp", ".lifecycle");
  return resolve(root, "state", "stacks");
}

function readPidFile(stateDir: string, service: string): number | null {
  const pidPath = resolve(stateDir, `${service}.pid`);
  try {
    const content = readFileSync(pidPath, "utf8").trim();
    const pid = Number.parseInt(content, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function readPortFile(stateDir: string, service: string): number | null {
  const portPath = resolve(stateDir, `${service}.port`);
  try {
    const content = readFileSync(portPath, "utf8").trim();
    const port = Number.parseInt(content, 10);
    return Number.isFinite(port) ? port : null;
  } catch {
    return null;
  }
}

function deriveServiceStatus(
  stateDir: string,
  serviceName: string,
): { status: string; assignedPort: number | null } {
  const pid = readPidFile(stateDir, serviceName);
  const port = readPortFile(stateDir, serviceName);

  if (pid !== null && isPidAlive(pid)) {
    return { status: "ready", assignedPort: port };
  }

  // PID file exists but process is dead.
  if (pid !== null) {
    return { status: "stopped", assignedPort: null };
  }

  return { status: "stopped", assignedPort: null };
}

export default defineCommand({
  description: "Show environment service status for the current workspace.",
  input: z.object({
    cwd: z.string().optional().describe("Workspace directory (defaults to current directory)."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const searchFrom = input.cwd ?? process.cwd();
      const manifest = await loadManifest({ searchFrom });
      const services = declaredServiceNames(manifest.config);

      // Derive a workspace id from the manifest path for state lookup.
      // Use the workspace path as a stable identifier.
      const workspaceId = manifest.workspacePath;
      const stateDir = resolve(lifecycleStatePath(), encodeURIComponent(workspaceId));

      const serviceEntries = services.map((name) => {
        const { status, assignedPort } = existsSync(stateDir)
          ? deriveServiceStatus(stateDir, name)
          : { status: "stopped" as const, assignedPort: null };

        return {
          name,
          status,
          assigned_port: assignedPort,
          preview_url: assignedPort ? `http://localhost:${assignedPort}` : null,
        };
      });

      if (input.json) {
        context.stdout(JSON.stringify({ services: serviceEntries }, null, 2));
        return 0;
      }

      if (serviceEntries.length === 0) {
        context.stdout("No services defined in lifecycle.json.");
        return 0;
      }

      for (const service of serviceEntries) {
        const indicator =
          service.status === "ready"
            ? "●"
            : service.status === "starting"
              ? "◐"
              : service.status === "failed"
                ? "✗"
                : "○";

        const port = service.assigned_port ? `  :${service.assigned_port}` : "";
        context.stdout(`${indicator} ${service.name.padEnd(16)} ${service.status}${port}`);
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
