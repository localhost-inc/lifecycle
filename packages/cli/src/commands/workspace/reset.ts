import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag, printWorkspaceSummary, workspaceIdFlag } from "../_shared";
import { resolveWorkspaceId } from "../_shared";

export default defineCommand({
  description: "Reset the workspace baseline and restart services.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].reset.$post({
        param: { id: workspaceId },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout("Workspace reset.");
      context.stdout("");
      printWorkspaceSummary(result.workspace, context.stdout);

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
