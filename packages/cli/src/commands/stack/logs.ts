import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";
import { existsSync, readFileSync, statSync, watchFile, unwatchFile } from "node:fs";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { declaredServiceNames } from "@lifecycle/stack";

import { loadManifest } from "../../manifest";
import { failCommand, failValidation, jsonFlag, printLogLine } from "../_shared";

function lifecycleLogPath(): string {
  const root = process.env.LIFECYCLE_ROOT ?? resolve(process.env.HOME ?? "/tmp", ".lifecycle");
  return resolve(root, "logs", "environments");
}

function logFilePaths(
  logDir: string,
  workspaceId: string,
  serviceName: string,
): { stdout: string; stderr: string } {
  return {
    stdout: resolve(logDir, `${workspaceId}:${serviceName}.stdout.log`),
    stderr: resolve(logDir, `${workspaceId}:${serviceName}.stderr.log`),
  };
}

function readLastLines(filePath: string, maxLines: number): string[] {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function tailFile(
  filePath: string,
  stream: "stdout" | "stderr",
  serviceName: string,
  onLine: (line: { service: string; stream: string; text: string; timestamp: string }) => void,
  signal: AbortSignal,
): void {
  if (!existsSync(filePath)) return;

  let offset = 0;
  try {
    offset = statSync(filePath).size;
  } catch {
    // Start from beginning if we can't get the size.
  }

  const poll = () => {
    if (signal.aborted) return;

    try {
      const currentSize = statSync(filePath).size;
      if (currentSize <= offset) return;

      const rs = createReadStream(filePath, { start: offset, encoding: "utf8" });
      const rl = createInterface({ input: rs });

      rl.on("line", (text) => {
        if (text.length > 0) {
          onLine({
            service: serviceName,
            stream,
            text,
            timestamp: new Date().toISOString(),
          });
        }
      });

      rl.on("close", () => {
        try {
          offset = statSync(filePath).size;
        } catch {
          // Ignore.
        }
      });
    } catch {
      // File may have been removed.
    }
  };

  watchFile(filePath, { interval: 250 }, poll);
  signal.addEventListener("abort", () => unwatchFile(filePath, poll));
}

export default defineCommand({
  description: "Tail logs for services in the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Optional service name to filter logs."),
    cwd: z.string().optional().describe("Workspace directory (defaults to current directory)."),
    follow: defineFlag(z.boolean().default(false).describe("Follow log output."), {
      aliases: "f",
    }),
    json: jsonFlag,
    tail: defineFlag(
      z.coerce.number().int().positive().optional().describe("Tail the last N lines."),
      { aliases: "t" },
    ),
  }),
  run: async (input, context) => {
    try {
      const searchFrom = input.cwd ?? process.cwd();
      const manifest = await loadManifest({ searchFrom });
      const allServices = declaredServiceNames(manifest.config);
      const workspaceId = manifest.workspacePath;
      const logDir = resolve(lifecycleLogPath(), encodeURIComponent(workspaceId));

      // Filter to requested service if provided.
      const targetServices =
        input.args.length > 0
          ? input.args.filter((name) => {
              if (!allServices.includes(name)) {
                context.stderr(`Unknown service: ${name}`);
                return false;
              }
              return true;
            })
          : allServices;

      if (targetServices.length === 0) {
        if (input.json) {
          context.stdout("[]");
        } else {
          context.stdout("No services to show logs for.");
        }
        return 0;
      }

      if (input.follow) {
        const ac = new AbortController();
        const onSignal = () => ac.abort();
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);

        try {
          for (const serviceName of targetServices) {
            const paths = logFilePaths(logDir, workspaceId, serviceName);
            const onLine = (line: {
              service: string;
              stream: string;
              text: string;
              timestamp: string;
            }) => {
              if (input.json) {
                context.stdout(JSON.stringify(line));
              } else {
                printLogLine(line, context.stdout);
              }
            };

            tailFile(paths.stdout, "stdout", serviceName, onLine, ac.signal);
            tailFile(paths.stderr, "stderr", serviceName, onLine, ac.signal);
          }

          // Wait until aborted.
          await new Promise<void>((resolve) => {
            if (ac.signal.aborted) return resolve();
            ac.signal.addEventListener("abort", () => resolve());
          });
        } finally {
          process.removeListener("SIGINT", onSignal);
          process.removeListener("SIGTERM", onSignal);
        }

        return 0;
      }

      // Non-follow: read last N lines.
      const maxLines = input.tail ?? 50;
      const allLines: Array<{
        service: string;
        stream: string;
        text: string;
        timestamp: string;
      }> = [];

      for (const serviceName of targetServices) {
        const paths = logFilePaths(logDir, workspaceId, serviceName);
        for (const [stream, filePath] of [
          ["stdout", paths.stdout],
          ["stderr", paths.stderr],
        ] as const) {
          const lines = readLastLines(filePath, maxLines);
          for (const text of lines) {
            allLines.push({
              service: serviceName,
              stream,
              text,
              timestamp: "",
            });
          }
        }
      }

      if (input.json) {
        context.stdout(JSON.stringify(allLines, null, 2));
        return 0;
      }

      for (const line of allLines) {
        printLogLine(line, context.stdout);
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
