import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createPlanCreateRequest, requestBridge } from "../../bridge";
import { failCommand, jsonFlag, repositoryIdFlag } from "../_shared";

export default defineCommand({
  description: "Create a new plan.",
  input: z.object({
    json: jsonFlag,
    name: z.string().describe("Plan name"),
    repositoryId: repositoryIdFlag,
    description: z.string().optional().describe("Plan description"),
    status: z.string().optional().describe("Initial status (draft, active)"),
  }),
  run: async (input, context) => {
    try {
      const response = await requestBridge(
        createPlanCreateRequest({
          repositoryId: input.repositoryId ?? "",
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          ...(input.status ? { status: input.status } : {}),
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout(`Plan "${response.result.plan.name}" created (${response.result.plan.id}).`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
