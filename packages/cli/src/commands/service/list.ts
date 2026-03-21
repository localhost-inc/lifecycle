import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import {
  createServiceListRequest,
  requestBridge,
  resolveWorkspaceId,
} from "../../bridge";
import { failCommand, jsonFlag, printServiceSummary, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "List services for the current workspace.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestBridge(
        createServiceListRequest({
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result.services, null, 2));
        return 0;
      }

      if (response.result.services.length === 0) {
        context.stdout(`No services configured for workspace ${workspaceId}.`);
        return 0;
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
