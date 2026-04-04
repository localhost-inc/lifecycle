import { resolve } from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Remove a local workspace from the config.",
  input: z.object({
    args: z.array(z.string()).describe("<name>"),
    json: jsonFlag,
    repoPath: z.string().optional().describe("Repo path. Defaults to current directory."),
  }),
  run: async (input, context) => {
    try {
      const name = input.args[0];
      if (!name) {
        context.stderr("Usage: lifecycle workspace remove <name> [--repo-path <path>]");
        return 1;
      }

      const repoPath = resolve(input.repoPath ?? process.cwd());
      const { client } = await ensureBridge();
      const res = await client.workspaces[":id"].$delete({
        param: { id: name },
        query: { repoPath },
      });
      const data = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify({ removed: data.archived, name, repoPath }, null, 2));
        return 0;
      }

      if (data.archived) {
        context.stdout(`Workspace "${name}" removed.`);
      } else {
        context.stdout(`Workspace "${name}" not found in config.`);
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
