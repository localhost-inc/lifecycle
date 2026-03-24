import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { createWorkspaceCreateRequest, requestBridge } from "../../bridge";
import { failCommand, jsonFlag, printWorkspaceSummary, projectIdFlag } from "../_shared";

export default defineCommand({
  description: "Create a workspace for a project.",
  input: z.object({
    json: jsonFlag,
    local: defineFlag(z.boolean().default(true).describe("Create a local workspace."), {
      aliases: "l",
    }),
    projectId: projectIdFlag,
    ref: z.string().optional().describe("Git ref or branch to base the workspace on."),
  }),
  run: async (input, context) => {
    try {
      const response = await requestBridge(
        createWorkspaceCreateRequest({
          local: input.local,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.ref ? { ref: input.ref } : {}),
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout("Workspace created.");
      context.stdout("");
      printWorkspaceSummary(response.result.workspace, context.stdout);

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
