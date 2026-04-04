import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag, workspaceIdFlag } from "../_shared";
import { resolveWorkspaceId } from "../../desktop/rpc";

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

      const { client } = await ensureBridge();
      const res = await client.workspaces[":id"].pr.merge.$post({
        param: { id: workspaceId },
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
