import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import { failCommand, jsonFlag, printHealthCheck, workspaceIdFlag } from "../_shared";
import { resolveWorkspaceId } from "../_shared";

export default defineCommand({
  description: "Run workspace health checks.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].health.$get({
        param: { id: workspaceId },
      });
      const result = await response.json();
      const checks = result.checks as Array<{
        healthy: boolean;
        message: string | null;
        service: string;
      }>;

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      const allHealthy = checks.every((check) => check.healthy);

      for (const check of checks) {
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
