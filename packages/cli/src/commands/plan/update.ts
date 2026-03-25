import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createPlanUpdateRequest, requestBridge } from "../../bridge";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Update an existing plan.",
  input: z.object({
    json: jsonFlag,
    id: z.string().describe("Plan id"),
    name: z.string().optional().describe("New name"),
    description: z.string().optional().describe("New description"),
    status: z.string().optional().describe("New status"),
  }),
  run: async (input, context) => {
    try {
      const response = await requestBridge(
        createPlanUpdateRequest({
          planId: input.id,
          ...(input.name ? { name: input.name } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.status ? { status: input.status } : {}),
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout(`Plan "${response.result.plan.name}" updated.`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
