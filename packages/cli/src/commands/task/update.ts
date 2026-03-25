import { defineCommand } from "@lifecycle/cmd";
import { parseTaskPriority } from "@lifecycle/contracts";
import { z } from "zod";

import { createTaskUpdateRequest, requestBridge } from "../../bridge";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Update an existing task.",
  input: z.object({
    json: jsonFlag,
    id: z.string().describe("Task id"),
    name: z.string().optional().describe("New name"),
    description: z.string().optional().describe("New description"),
    status: z.string().optional().describe("New status (pending, in_progress, completed, cancelled)"),
    priority: z.string().optional().describe("New priority (low, normal, high, urgent)"),
  }),
  run: async (input, context) => {
    try {
      const response = await requestBridge(
        createTaskUpdateRequest({
          taskId: input.id,
          ...(input.name ? { name: input.name } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.priority ? { priority: parseTaskPriority(input.priority) } : {}),
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout(`Task "${response.result.task.name}" updated.`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
