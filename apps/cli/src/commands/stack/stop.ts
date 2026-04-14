import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import {
  failCommand,
  jsonFlag,
  printServiceSummary,
  resolveWorkspaceId,
  stackServices,
  workspaceIdFlag,
} from "../_shared";

export default defineCommand({
  description: "Stop environment services for the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Optional service names to stop (stops all if omitted)."),
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].stack.stop.$post({
        param: { id: workspaceId },
        json: input.args.length > 0 ? { serviceNames: input.args } : {},
      });
      const result = await response.json();
      const services = stackServices(result.stack);
      const stoppedServices = result.stoppedServices ?? [];

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      if (result.stack.state === "missing") {
        context.stdout("No lifecycle.json found. Managed stack commands are unavailable.");
        return 0;
      }

      if (result.stack.state === "unconfigured") {
        context.stdout("No managed stack configured for this workspace.");
        return 0;
      }

      if (stoppedServices.length === 0) {
        context.stdout("No services were running.");
        return 0;
      }

      context.stdout(`Stopped: ${stoppedServices.join(", ")}`);
      services.forEach((service, index) => {
        if (index > 0) {
          context.stdout("");
        }
        printServiceSummary(service, context.stdout);
      });

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
