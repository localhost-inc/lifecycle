import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag, printServiceSummary, resolveWorkspaceId, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Start or restart workspace services.",
  input: z.object({
    json: jsonFlag,
    service: defineFlag(
      z.array(z.string()).optional().describe("Specific service names to start."),
      { aliases: "s" },
    ),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].services.start.$post({
        param: { id: workspaceId },
        json: input.service ? { serviceNames: input.service } : {},
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      if (result.startedServices.length > 0) {
        context.stdout(`Started: ${result.startedServices.join(", ")}`);
        context.stdout("");
      }

      result.services.forEach((service, index) => {
        if (index > 0) {
          context.stdout("");
        }
        printServiceSummary(service, context.stdout);
      });

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
