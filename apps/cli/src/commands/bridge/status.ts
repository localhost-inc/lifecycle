import { defineCommand } from "@localhost-inc/cmd";
import { readBridgeRegistration } from "@/bridge";
import { resolveBridgePort } from "@/bridge/stack";
import { z } from "zod";

export default defineCommand({
  description: "Show the status of the Lifecycle bridge server.",
  input: z.object({}),
  async run(_input, context) {
    const port = resolveBridgePort();
    const registration = await readBridgeRegistration();

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const payload = (await response.json()) as { healthy?: boolean };

      if (payload.healthy) {
        const pidSummary = registration ? `pid ${registration.pid}, ` : "";
        context.stdout(`Bridge is running (${pidSummary}http://127.0.0.1:${port}).`);
      } else {
        context.stdout(`Bridge responded but reported unhealthy.`);
      }
    } catch {
      if (registration) {
        context.stdout(
          `Bridge registration exists (pid ${registration.pid}) but is not responding.`,
        );
        return;
      }

      context.stdout("Bridge is not running.");
    }
  },
});
