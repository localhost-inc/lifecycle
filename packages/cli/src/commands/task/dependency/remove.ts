import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createTaskDependencyRemoveRequest, requestDesktopRpc } from "../../../desktop/rpc";
import { failCommand, jsonFlag, repositoryIdFlag } from "../../_shared";

export default defineCommand({
  description: "Remove a dependency between tasks.",
  input: z.object({
    json: jsonFlag,
    taskId: z.string().describe("Task to remove the dependency from"),
    dependsOn: z.string().describe("Dependency to remove"),
    repositoryId: repositoryIdFlag,
  }),
  run: async (input, context) => {
    try {
      await requestDesktopRpc(
        createTaskDependencyRemoveRequest({
          taskId: input.taskId,
          dependsOnTaskId: input.dependsOn,
          repositoryId: input.repositoryId ?? "",
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify({ removed: true }, null, 2));
        return 0;
      }

      context.stdout(
        `Dependency removed: ${input.taskId} no longer depends on ${input.dependsOn}.`,
      );
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
