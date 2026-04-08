import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
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
      const { client } = await ensureBridge();

      // Find the workspace's worktree path from the repo listing
      const res = await client.repos.$get();
      const { repositories } = await res.json();
      const repo = repositories.find((r) => r.path === repoPath);
      const ws = repo?.workspaces?.find((w) => w.name === name);
      const workspaceRoot = ws?.path;

      // Check for uncommitted changes
      if (!input.force && workspaceRoot) {
        try {
          const out = execSync("git status --porcelain", {
            cwd: workspaceRoot,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          if (out.trim().length > 0) {
            if (input.json) {
              context.stdout(
                JSON.stringify(
                  { archived: false, reason: "uncommitted_changes", name, workspaceRoot },
                  null,
                  2,
                ),
              );
              return 1;
            }
            context.stderr(
              `Workspace "${name}" has uncommitted changes. Use --force to delete anyway.`,
            );
            return 1;
          }
        } catch {
          // git not available or not a repo — proceed
        }
      }

      // Remove git worktree
      if (workspaceRoot) {
        removeWorktree(repoPath, workspaceRoot);
      }

      // Archive via bridge
      const wsId = ws?.id ?? name;
      await client.workspaces[":id"].$delete({
        param: { id: wsId },
        query: { repoPath },
      });

      if (input.json) {
        context.stdout(
          JSON.stringify(
            { archived: true, name, repoPath, workspaceRoot: workspaceRoot ?? null },
            null,
            2,
          ),
        );
        return 0;
      }

      context.stdout(`Workspace "${name}" archived.`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
