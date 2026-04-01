import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createClient } from "../../rpc-client";
import { failCommand, jsonFlag, workspaceIdFlag } from "../_shared";
import { resolveWorkspaceId } from "../../bridge";

export default defineCommand({
  description: "Create a pull request from a cloud workspace.",
  input: z.object({
    workspaceId: workspaceIdFlag,
    title: z.string().optional().describe("PR title."),
    body: z.string().optional().describe("PR body."),
    baseBranch: z.string().optional().describe("Base branch to merge into."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);

      const client = createClient();
      const res = await client.workspaces[":workspaceId"].pr.$post({
        param: { workspaceId },
        json: {
          ...(input.title ? { title: input.title } : {}),
          ...(input.body ? { body: input.body } : {}),
          ...(input.baseBranch ? { baseBranch: input.baseBranch } : {}),
        },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`PR #${result.number} created.`);
      context.stdout(`url: ${result.url}`);
      context.stdout(`${result.headBranch} -> ${result.baseBranch}`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
