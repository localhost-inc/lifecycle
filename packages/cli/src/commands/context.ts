import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createContextRequest, requestBridge, resolveWorkspaceId } from "../bridge";
import { failCommand, workspaceIdFlag } from "./_shared";

export default defineCommand({
  description: "Emit machine-readable workspace context for agents.",
  input: z.object({
    json: z.boolean().default(true).describe("Emit JSON output."),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestBridge(
        createContextRequest({
          workspaceId,
        }),
      );

      context.stdout(JSON.stringify(response.result, null, 2));
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: true,
        stderr: context.stderr,
      });
    }
  },
});
