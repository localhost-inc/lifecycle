import { defineCommand } from "@lifecycle/cmd";
import { startBridgeServer } from "@lifecycle/bridge/server";
import { writeBridgeRegistration, removeBridgeRegistration } from "@lifecycle/bridge";
import { z } from "zod";

import { getStackClientRegistry } from "../../stack-registry";
import { getWorkspaceClientRegistry } from "../../workspace-registry";

export default defineCommand({
  description: "Start the local Lifecycle bridge server.",
  input: z.object({
    port: z.coerce.number().optional().describe("Port to listen on. Defaults to a random port."),
  }),
  async run(input, context) {
    const { port } = await startBridgeServer({
      ...(input.port != null ? { port: input.port } : {}),
      stackRegistry: getStackClientRegistry(),
      workspaceRegistry: getWorkspaceClientRegistry(),
    });

    await writeBridgeRegistration({ pid: process.pid, port: port as number });
    context.stderr(`Lifecycle bridge listening on http://127.0.0.1:${port}`);

    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      await removeBridgeRegistration();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());

    await new Promise(() => {});
  },
});
