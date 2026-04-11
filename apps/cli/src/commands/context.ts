import { defineCommand } from "@localhost-inc/cmd";
import { z } from "zod";

import { createContextRequest, requestDesktopRpc, resolveWorkspaceId } from "../desktop/rpc";
import { failCommand, workspaceIdFlag } from "./_shared";

export default defineCommand({
  description: "Emit machine-readable workspace context.",
  input: z.object({
    json: z.boolean().default(true).describe("Emit JSON output."),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestDesktopRpc(
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
