import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { ensureBridge } from "@lifecycle/bridge";
import { createWorktree } from "../../git-worktree";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Create a workspace for a project.",
  input: z.object({
    args: z.array(z.string()).optional().describe("[name]"),
    json: jsonFlag,
    repoPath: z.string().optional().describe("Local repo path. Defaults to current directory."),
    ref: z.string().optional().describe("Git ref or branch to base the workspace on."),
  }),
  run: async (input, context) => {
    try {
      // Local workspace — create git worktree + register via bridge
      const name = input.args?.[0];
      if (!name) {
        context.stderr("Usage: lifecycle workspace create <name> --host local [--repo-path <path>] [--ref <branch>]");
        return 1;
      }

      const repoPath = resolve(input.repoPath ?? process.cwd());
      const repoSlug = basename(repoPath).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const wsSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const worktreePath = join(homedir(), ".lifecycle", "worktrees", repoSlug, wsSlug);
      const ref = input.ref ?? name;

      mkdirSync(join(homedir(), ".lifecycle", "worktrees", repoSlug), { recursive: true });

      try {
        createWorktree(repoPath, worktreePath, ref);
      } catch (err) {
        context.stderr(`Failed to create worktree: ${err instanceof Error ? err.message : err}`);
        return 1;
      }

      const { client } = await ensureBridge();
      await client.workspaces.$post({
        json: { repoPath, name, sourceRef: ref, worktreePath },
      });

      if (input.json) {
        context.stdout(JSON.stringify({ name, host: "local", repoPath, worktreePath, ref }, null, 2));
        return 0;
      }

      context.stdout(`Workspace "${name}" created at ${worktreePath}`);
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
