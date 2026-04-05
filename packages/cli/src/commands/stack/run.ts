import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LocalStackClient } from "@lifecycle/stack/internal/local";
import { declaredServiceNames, type StartStackInput } from "@lifecycle/stack";
import type { ServiceRecord } from "@lifecycle/contracts";

import { loadManifest } from "../../manifest";
import { failCommand, jsonFlag } from "../_shared";

function lifecycleStatePath(): string {
  const root = process.env.LIFECYCLE_ROOT ?? resolve(process.env.HOME ?? "/tmp", ".lifecycle");
  return resolve(root, "state", "stacks");
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "unnamed"
  );
}

export default defineCommand({
  description: "Start the stack for the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Optional service names to start (starts all if omitted)."),
    cwd: z.string().optional().describe("Workspace directory (defaults to current directory)."),
    detach: z.boolean().optional().default(false).describe("Start services and exit immediately."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const searchFrom = input.cwd ?? process.cwd();
      const manifest = await loadManifest({ searchFrom });
      const allServices = declaredServiceNames(manifest.config);
      const workspaceId = manifest.workspacePath;

      const serviceNames = input.args.length > 0 ? input.args : undefined;

      // Build minimal service records for the input.
      const services: ServiceRecord[] = allServices.map((name) => ({
        id: `${workspaceId}:${name}`,
        workspace_id: workspaceId,
        name,
        status: "stopped" as const,
        status_reason: null,
        assigned_port: null,
        preview_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const hostLabel = slugify(manifest.workspacePath.split("/").pop() ?? "workspace");

      const startInput: StartStackInput = {
        stackId: workspaceId,
        hostLabel,
        name: hostLabel,
        prepared: false,
        readyServiceNames: [],
        rootPath: manifest.workspacePath,
        services,
        sourceRef: "local",
        ...(serviceNames ? { serviceNames } : {}),
        callbacks: {
          onServiceStarting: (name) => {
            if (!input.json) {
              context.stdout(`Starting ${name}...`);
            }
          },
          onServiceReady: (service) => {
            if (!input.json) {
              const port = service.assignedPort ? ` on :${service.assignedPort}` : "";
              context.stdout(`● ${service.name} ready${port}`);
            }
          },
          onServiceFailed: (name) => {
            if (!input.json) {
              context.stderr(`✗ ${name} failed`);
            }
          },
        },
      };

      const client = new LocalStackClient();
      const result = await client.start(manifest.config, startInput);

      // Write state files so stack status can check liveness.
      const stateDir = resolve(lifecycleStatePath(), encodeURIComponent(workspaceId));
      mkdirSync(stateDir, { recursive: true });

      const supervisor = client.getSupervisor();
      for (const started of result.startedServices) {
        const pid = supervisor.pid(`${workspaceId}:${started.name}`);
        if (pid !== null) {
          writeFileSync(resolve(stateDir, `${started.name}.pid`), String(pid), "utf8");
        }
        if (started.assignedPort !== null) {
          writeFileSync(
            resolve(stateDir, `${started.name}.port`),
            String(started.assignedPort),
            "utf8",
          );
        }
      }

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
      }

      // Detached mode: services are already spawned with detached: true,
      // so they survive after this process exits. Just report and go.
      if (input.detach) {
        if (!input.json && result.startedServices.length > 0) {
          context.stdout(`\n${result.startedServices.length} service(s) running (detached).`);
        }
        return 0;
      }

      // Foreground mode: stay alive so the user can Ctrl+C to stop.
      if (result.startedServices.length > 0 && !input.json) {
        context.stdout(
          `\n${result.startedServices.length} service(s) running. Press Ctrl+C to stop.`,
        );

        await new Promise<void>((waitResolve) => {
          const onSignal = () => {
            context.stdout("\nStopping services...");
            supervisor.killAll();
            waitResolve();
          };
          process.once("SIGINT", onSignal);
          process.once("SIGTERM", onSignal);
        });
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
