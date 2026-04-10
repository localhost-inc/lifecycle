import { resolve } from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Archive (delete) a local workspace and its git worktree.",
  input: z.object({
    args: z.array(z.string()).describe("<name>"),
    json: jsonFlag,
    repoPath: z.string().optional().describe("Repo path. Defaults to current directory."),
    force: z.boolean().default(false).describe("Skip uncommitted changes check."),
  }),
  run: async (input, context) => {
    try {
      const name = input.args[0];
      if (!name) {
        context.stderr("Usage: lifecycle workspace archive <name> [--repo-path <path>] [--force]");
        return 1;
      }

      const repoPath = resolve(input.repoPath ?? process.cwd());
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].$delete({
        param: { id: name },
        query: {
          ...(input.force ? { force: "true" } : {}),
          repoPath,
        },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`Workspace "${result.name}" archived.`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
