import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import {
  createWorkspaceHealthRequest,
  requestDesktopRpc,
  resolveWorkspaceId,
} from "../../desktop/rpc";
import { failCommand, jsonFlag, printHealthCheck, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Run workspace health checks.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestDesktopRpc(
        createWorkspaceHealthRequest({
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      const allHealthy = response.result.checks.every((check) => check.healthy);

      for (const check of response.result.checks) {
        printHealthCheck(check, context.stdout);
      }

      return allHealthy ? 0 : 1;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
