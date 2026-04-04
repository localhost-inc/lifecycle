import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createWorkspaceResetRequest, requestDesktopRpc, resolveWorkspaceId } from "../../desktop/rpc";
import { failCommand, jsonFlag, printWorkspaceSummary, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Reset the workspace baseline and restart services.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestDesktopRpc(
        createWorkspaceResetRequest({
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout("Workspace reset.");
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
