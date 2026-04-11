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
  description: "Start the stack for the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Optional service names to start (starts all if omitted)."),
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].stack.start.$post({
        param: { id: workspaceId },
        json: input.args.length > 0 ? { serviceNames: input.args } : {},
      });
      const result = await response.json();
      const services = stackServices(result.stack);
      const startedServices = result.startedServices ?? [];

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      if (startedServices.length > 0) {
        context.stdout(`Started services: ${startedServices.join(", ")}`);
      } else {
        context.stdout(`Started workspace services for ${result.workspaceId}.`);
      }

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
