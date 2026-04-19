import { resolve } from "node:path";
import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import { failCommand, jsonFlag, workspaceIdFlag } from "../_shared";
import { resolveWorkspaceId } from "../_shared";

export default defineCommand({
  description: "Delete a workspace.",
  input: z.object({
    args: z.array(z.string()).describe("[workspace]"),
    force: z.boolean().default(false).describe("Skip uncommitted changes check."),
    json: jsonFlag,
    repoPath: z
      .string()
      .optional()
      .describe("Repository path. Required when deleting a workspace by name."),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = input.args[0] ?? resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].$delete({
        param: { id: workspaceId },
        query: {
          ...(input.force ? { force: "true" } : {}),
          ...(input.repoPath ? { repoPath: resolve(input.repoPath) } : {}),
        },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`Workspace "${result.name}" deleted.`);

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
