import { spawnSync } from "node:child_process";
import { defineCommand } from "@localhost-inc/cmd";
import { readBridgeRegistration, removeBridgeRegistration } from "@/bridge";
import { resolveBridgePort } from "@/bridge/stack";
import { z } from "zod";

function lifecycleBridgePidOnPort(port: number): number | null {
  const listeners = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  const pids = (listeners.stdout ?? "")
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);

  for (const pid of pids) {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    const command = result.stdout?.trim() ?? "";
    if (
      command.includes("lifecycle bridge start") ||
      command.includes("/src/bridge/app.ts") ||
      command.includes("\\src\\bridge\\app.ts")
    ) {
      return pid;
    }
  }

  return null;
}

export default defineCommand({
  description: "Stop the running Lifecycle bridge server.",
  input: z.object({}),
  async run(_input, context) {
    const registration = await readBridgeRegistration();
    const pid = registration?.pid ?? lifecycleBridgePidOnPort(resolveBridgePort());
    if (!pid) {
      context.stderr("No running bridge found.");
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
      context.stderr(`Stopped bridge (pid ${pid}).`);
    } catch {
      context.stderr(`Bridge process ${pid} is not running.`);
    }

    await removeBridgeRegistration();
  },
});
