import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createTaskDependencyAddRequest, requestDesktopRpc } from "../../../desktop/rpc";
import { failCommand, jsonFlag, repositoryIdFlag } from "../../_shared";

export default defineCommand({
  description: "Add a dependency between tasks.",
  input: z.object({
    json: jsonFlag,
    taskId: z.string().describe("Task that depends on another"),
    dependsOn: z.string().describe("Task that must complete first"),
    repositoryId: repositoryIdFlag,
  }),
  run: async (input, context) => {
    try {
      await requestDesktopRpc(
        createTaskDependencyAddRequest({
          taskId: input.taskId,
          dependsOnTaskId: input.dependsOn,
          repositoryId: input.repositoryId ?? "",
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify({ added: true }, null, 2));
        return 0;
      }

      context.stdout(`Dependency added: ${input.taskId} depends on ${input.dependsOn}.`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
