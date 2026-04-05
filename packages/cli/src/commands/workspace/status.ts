import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import {
  createWorkspaceGetRequest,
  requestDesktopRpc,
  resolveWorkspaceId,
} from "../../desktop/rpc";
import { failCommand, jsonFlag, printWorkspaceSummary, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Show workspace metadata, environment state, and services.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestDesktopRpc(
        createWorkspaceGetRequest({
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      printWorkspaceSummary(response.result.workspace, context.stdout);

      if (response.result.services.length > 0) {
        context.stdout("");
        context.stdout("Services:");
        response.result.services.forEach((service) => {
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
