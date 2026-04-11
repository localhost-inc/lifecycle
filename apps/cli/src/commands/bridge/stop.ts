import { defineCommand } from "@localhost-inc/cmd";
import { readBridgeRegistration, removeBridgeRegistration } from "@/bridge";
import { z } from "zod";

export default defineCommand({
  description: "Stop the running Lifecycle bridge server.",
  input: z.object({}),
  async run(_input, context) {
    const registration = await readBridgeRegistration();
    if (!registration) {
      context.stderr("No running bridge found.");
      return;
    }

    try {
      process.kill(registration.pid, "SIGTERM");
      context.stderr(`Stopped bridge (pid ${registration.pid}).`);
    } catch {
      context.stderr(`Bridge process ${registration.pid} is not running.`);
    }

    await removeBridgeRegistration();
  },
});
