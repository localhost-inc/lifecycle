import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createClient } from "../../rpc-client";
import { failCommand, jsonFlag, workspaceIdFlag } from "../_shared";
import { resolveWorkspaceId } from "../../bridge";

export default defineCommand({
  description: "Merge a pull request from a cloud workspace.",
  input: z.object({
    workspaceId: workspaceIdFlag,
    pullRequestNumber: z.coerce.number().describe("Pull request number to merge."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);

      const client = createClient();
      const res = await client.workspaces[":workspaceId"].pr.merge.$post({
        param: { workspaceId },
        json: { pullRequestNumber: input.pullRequestNumber },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      if (result.merged) {
        context.stdout(`PR #${result.number} merged.`);
      } else {
        context.stdout(`PR #${result.number} could not be merged (state: ${result.state}).`);
      }
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
