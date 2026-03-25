import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createTaskDependencyAddRequest, requestBridge } from "../../../bridge";
import { failCommand, jsonFlag, projectIdFlag } from "../../_shared";

export default defineCommand({
  description: "Add a dependency between tasks.",
  input: z.object({
    json: jsonFlag,
    taskId: z.string().describe("Task that depends on another"),
    dependsOn: z.string().describe("Task that must complete first"),
    projectId: projectIdFlag,
  }),
  run: async (input, context) => {
    try {
      await requestBridge(
        createTaskDependencyAddRequest({
          taskId: input.taskId,
          dependsOnTaskId: input.dependsOn,
          projectId: input.projectId ?? "",
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
