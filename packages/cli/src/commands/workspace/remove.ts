import { resolve } from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { getLifecycleDb } from "@lifecycle/db";
import { archiveWorkspace, getRepositoryByPath } from "@lifecycle/db/queries";
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
      const db = await getLifecycleDb();
      const repo = await getRepositoryByPath(db, repoPath);
      const removed = repo ? await archiveWorkspace(db, repo.id, name) : false;

      if (input.json) {
        context.stdout(JSON.stringify({ removed, name, repoPath }, null, 2));
        return 0;
      }

      if (removed) {
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
