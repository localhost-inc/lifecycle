import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import {
  failCommand,
  jsonFlag,
  printWorkspaceSummary,
  resolveWorkspaceId,
  stackServices,
  workspaceIdFlag,
} from "../_shared";

export default defineCommand({
  description: "Show workspace metadata, environment state, and services.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].$get({
        param: { id: workspaceId },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      printWorkspaceSummary(result.workspace, context.stdout);
      const services = stackServices(result.stack);

      if (services.length > 0) {
        context.stdout("");
        context.stdout("Services:");
        services.forEach((service) => {
          context.stdout(`  ${service.name}: ${service.status}`);
        });
      }

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
