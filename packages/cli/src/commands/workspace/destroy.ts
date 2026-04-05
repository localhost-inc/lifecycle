import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import {
  createWorkspaceArchiveRequest,
  requestDesktopRpc,
  resolveWorkspaceId,
} from "../../desktop/rpc";
import { failCommand, jsonFlag, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Archive a workspace.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestDesktopRpc(
        createWorkspaceArchiveRequest({
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout(`Workspace ${response.result.workspaceId} archived.`);

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
