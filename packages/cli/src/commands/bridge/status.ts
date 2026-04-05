import { defineCommand } from "@lifecycle/cmd";
import { readBridgeRegistration } from "@lifecycle/bridge";
import { z } from "zod";

export default defineCommand({
  description: "Show the status of the Lifecycle bridge server.",
  input: z.object({}),
  async run(_input, context) {
    const registration = await readBridgeRegistration();
    if (!registration) {
      context.stdout("Bridge is not running.");
      return;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${registration.port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const payload = (await response.json()) as { healthy?: boolean };

      if (payload.healthy) {
        context.stdout(
          `Bridge is running (pid ${registration.pid}, http://127.0.0.1:${registration.port}).`,
        );
      } else {
        context.stdout(`Bridge responded but reported unhealthy.`);
      }
    } catch {
      context.stdout(`Bridge registration exists (pid ${registration.pid}) but is not responding.`);
    }
  },
});
