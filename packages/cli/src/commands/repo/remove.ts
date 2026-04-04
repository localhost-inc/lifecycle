import path from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Remove a repository from Lifecycle tracking.",
  input: z.object({
    json: jsonFlag,
    path: z
      .string()
      .optional()
      .describe("Repository path. Defaults to the current directory."),
  }),
  run: async (input, context) => {
    try {
      const repoPath = path.resolve(input.path ?? process.cwd());
      const { client } = await ensureBridge();

      const res = await client.repos.$get();
      const { repositories } = await res.json();
      const repo = repositories.find((r) => r.path === repoPath);

      if (!repo) {
        if (input.json) {
          context.stdout(JSON.stringify({ removed: false, error: "not_found" }));
          return 1;
        }
        context.stderr(`No tracked repository at ${repoPath}`);
        return 1;
      }

      await client.repos[":repoId"].$delete({ param: { repoId: repo.id } });

      if (input.json) {
        context.stdout(JSON.stringify({ removed: true, name: repo.name, path: repoPath }));
        return 0;
      }

      context.stdout(`Removed ${repo.name} (${repoPath})`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
