import { defineCommand } from "@lifecycle/cmd";
import { parseTaskPriority } from "@lifecycle/contracts";
import { z } from "zod";

import { createTaskCreateRequest, requestBridge } from "../../bridge";
import { failCommand, jsonFlag, projectIdFlag } from "../_shared";

export default defineCommand({
  description: "Create a new task within a plan.",
  input: z.object({
    json: jsonFlag,
    planId: z.string().describe("Parent plan id"),
    projectId: projectIdFlag,
    name: z.string().describe("Task name"),
    description: z.string().optional().describe("Task description"),
    priority: z.string().optional().describe("Priority (low, normal, high, urgent)"),
  }),
  run: async (input, context) => {
    try {
      const response = await requestBridge(
        createTaskCreateRequest({
          planId: input.planId,
          projectId: input.projectId ?? "",
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          ...(input.priority ? { priority: parseTaskPriority(input.priority) } : {}),
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout(`Task "${response.result.task.name}" created (${response.result.task.id}).`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
