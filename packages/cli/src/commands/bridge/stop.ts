import { defineCommand } from "@lifecycle/cmd";
import { readPidfile, removePidfile } from "@lifecycle/bridge";
import { z } from "zod";

export default defineCommand({
  description: "Stop the running Lifecycle bridge server.",
  input: z.object({}),
  async run(_input, context) {
    const pidfile = await readPidfile();
    if (!pidfile) {
      context.stderr("No running bridge found.");
      return;
    }

    try {
      process.kill(pidfile.pid, "SIGTERM");
      context.stderr(`Stopped bridge (pid ${pidfile.pid}).`);
    } catch {
      context.stderr(`Bridge process ${pidfile.pid} is not running.`);
    }

    await removePidfile();
  },
});
