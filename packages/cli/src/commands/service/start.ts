import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
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
  description: "Start services for the current workspace.",
  input: z.object({
    args: z
      .array(z.string())
      .describe("Optional service names to start. Omit to start the full workspace service chain."),
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

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      if (result.startedServices.length > 0) {
        context.stdout(`Started services: ${result.startedServices.join(", ")}`);
      } else {
        context.stdout(`Started workspace services for ${result.workspaceId}.`);
      }

      for (const service of services) {
        printServiceSummary(service, context.stdout);
      }

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
