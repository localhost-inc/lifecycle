import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import {
  failCommand,
  jsonFlag,
  printServiceSummary,
  resolveWorkspaceId,
  workspaceIdFlag,
} from "../_shared";

export default defineCommand({
  description: "List services for the current workspace.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].services.$get({
        param: { id: workspaceId },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result.services, null, 2));
        return 0;
      }

      if (result.services.length === 0) {
        context.stdout(`No services configured for workspace ${workspaceId}.`);
        return 0;
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
