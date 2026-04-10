import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag, workspaceIdFlag } from "../_shared";
import { resolveWorkspaceId } from "../_shared";

export default defineCommand({
  description: "Archive a workspace.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].$delete({
        param: { id: workspaceId },
        query: {},
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`Workspace ${workspaceId} archived.`);

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
