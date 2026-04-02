import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { getLifecycleDb } from "@lifecycle/db";
import { archiveWorkspace, getRepositoryByPath, listWorkspacesByRepository } from "@lifecycle/db/queries";
import { z } from "zod";

import { removeWorktree } from "../../git-worktree";
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
      const db = await getLifecycleDb();
      const repo = await getRepositoryByPath(db, repoPath);
      if (!repo) {
        context.stderr(`No repository registered at ${repoPath}`);
        return 1;
      }

      const workspaces = await listWorkspacesByRepository(db, repo.id);
      const ws = workspaces.find((w) => w.name === name);
      const worktreePath = ws?.worktree_path;

      // Check for uncommitted changes
      if (!input.force && worktreePath) {
        try {
          const out = execSync("git status --porcelain", {
            cwd: worktreePath,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          if (out.trim().length > 0) {
            if (input.json) {
              context.stdout(JSON.stringify({ archived: false, reason: "uncommitted_changes", name, worktreePath }, null, 2));
              return 1;
            }
            context.stderr(`Workspace "${name}" has uncommitted changes. Use --force to delete anyway.`);
            return 1;
          }
        } catch {
          // git not available or not a repo — proceed
        }
      }

      // Remove git worktree
      if (worktreePath) {
        removeWorktree(repoPath, worktreePath);
      }

      // Archive in db
      await archiveWorkspace(db, repo.id, name);

      if (input.json) {
        context.stdout(JSON.stringify({ archived: true, name, repoPath, worktreePath: worktreePath ?? null }, null, 2));
        return 0;
      }

      context.stdout(`Workspace "${name}" archived.`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
