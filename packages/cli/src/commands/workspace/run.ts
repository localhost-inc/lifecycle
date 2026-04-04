import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { createWorkspaceRunRequest, requestDesktopRpc, resolveWorkspaceId } from "../../desktop/rpc";
import { failCommand, jsonFlag, printServiceSummary, workspaceIdFlag } from "../_shared";

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
      const response = await requestDesktopRpc(
        createWorkspaceRunRequest({
          ...(input.service ? { serviceNames: input.service } : {}),
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      if (response.result.startedServices.length > 0) {
        context.stdout(`Started: ${response.result.startedServices.join(", ")}`);
        context.stdout("");
      }

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
