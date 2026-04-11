import { defineCommand } from "@localhost-inc/cmd";
import { startBridgeServer } from "@/bridge/server";
import { z } from "zod";

export default defineCommand({
  description: "Start the Lifecycle bridge server.",
  input: z.object({
    port: z.coerce.number().optional().describe("Port to listen on. Defaults to a random port."),
  }),
  async run(input, context) {
    const bridge =
      input.port != null ? await startBridgeServer({ port: input.port }) : await startBridgeServer();
    context.stdout(`Lifecycle bridge listening on http://127.0.0.1:${bridge.port}`);
    await bridge.wait();
  },
});
