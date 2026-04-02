import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createTaskDeleteRequest, requestBridge } from "../../bridge";
import { failCommand, jsonFlag, repositoryIdFlag } from "../_shared";

export default defineCommand({
  description: "Delete a task.",
  input: z.object({
    json: jsonFlag,
    id: z.string().describe("Task id"),
    repositoryId: repositoryIdFlag,
  }),
  run: async (input, context) => {
    try {
      await requestBridge(
        createTaskDeleteRequest({
          taskId: input.id,
          repositoryId: input.repositoryId ?? "",
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify({ deleted: true }, null, 2));
        return 0;
      }

      context.stdout("Task deleted.");
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
