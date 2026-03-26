import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createServiceStopRequest, requestBridge, resolveWorkspaceId } from "../../bridge";
import { failCommand, jsonFlag, printServiceSummary, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Stop services for the current workspace.",
  input: z.object({
    args: z
      .array(z.string())
      .describe("Optional service names to stop. Omit to stop the full workspace service chain."),
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestBridge(
        createServiceStopRequest({
          ...(input.args.length > 0 ? { serviceNames: input.args } : {}),
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      if (response.result.stoppedServices.length === 0) {
        context.stdout("No services were running.");
        return 0;
      }

      context.stdout(`Stopped: ${response.result.stoppedServices.join(", ")}`);
      context.stdout("");

      response.result.services.forEach((service, index) => {
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
