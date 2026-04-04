import { defineCommand } from "@lifecycle/cmd";
import { readPidfile } from "@lifecycle/bridge";
import { z } from "zod";

export default defineCommand({
  description: "Show the status of the Lifecycle bridge server.",
  input: z.object({}),
  async run(_input, context) {
    const pidfile = await readPidfile();
    if (!pidfile) {
      context.stdout("Bridge is not running.");
      return;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${pidfile.port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const payload = (await response.json()) as { healthy?: boolean };

      if (payload.healthy) {
        context.stdout(`Bridge is running (pid ${pidfile.pid}, http://127.0.0.1:${pidfile.port}).`);
      } else {
        context.stdout(`Bridge responded but reported unhealthy.`);
      }
    } catch {
      context.stdout(`Bridge pidfile exists (pid ${pidfile.pid}) but is not responding.`);
    }
  },
});
