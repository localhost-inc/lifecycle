import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createPlanDeleteRequest, requestBridge } from "../../bridge";
import { failCommand, jsonFlag, projectIdFlag } from "../_shared";

export default defineCommand({
  description: "Delete a plan and all its tasks.",
  input: z.object({
    json: jsonFlag,
    id: z.string().describe("Plan id"),
    projectId: projectIdFlag,
  }),
  run: async (input, context) => {
    try {
      await requestBridge(
        createPlanDeleteRequest({
          planId: input.id,
          projectId: input.projectId ?? "",
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify({ deleted: true }, null, 2));
        return 0;
      }

      context.stdout("Plan deleted.");
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
