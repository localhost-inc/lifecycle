import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { getLifecycleDb } from "@lifecycle/db";
import { getRepositoryByPath, insertRepository, insertWorkspace } from "@lifecycle/db/queries";
import { createClient } from "../../rpc-client";
import { createWorktree } from "../../git-worktree";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Create a workspace for a project.",
  input: z.object({
    args: z.array(z.string()).optional().describe("[name]"),
    json: jsonFlag,
    host: z
      .enum(["local", "cloud"])
      .default("local")
      .describe("Workspace host. Use 'cloud' for a cloud workspace."),
    repoId: z.string().optional().describe("Repository id for cloud workspaces."),
    repoPath: z.string().optional().describe("Local repo path. Defaults to current directory."),
    ref: z.string().optional().describe("Git ref or branch to base the workspace on."),
  }),
  run: async (input, context) => {
    try {
      // Cloud workspace path
      if (input.host === "cloud") {
        if (!input.repoId) {
          context.stderr("--repo-id is required for cloud workspaces.");
          return 1;
        }

        const name = input.args?.[0] ?? `workspace-${Date.now()}`;

        context.stdout(`Creating cloud workspace "${name}"...`);

        const client = createClient();
        const res = await client.workspaces.$post({
          json: {
            repositoryId: input.repoId,
            name,
            ...(input.ref ? { sourceRef: input.ref } : {}),
          },
        });
        const result = await res.json();
        const workspaceId = result.id;

        if (input.json) {
          context.stdout(JSON.stringify(result, null, 2));
          return 0;
        }

        // Poll until active or failed.
        const start = Date.now();
        const deadline = start + 300_000; // 5 min
        let status = result.status;
        let failureReason: string | undefined;

        while (status === "provisioning" && Date.now() < deadline) {
          const elapsed = Math.round((Date.now() - start) / 1000);
          process.stdout.write(`\rProvisioning workspace... ${elapsed}s`);

          await new Promise((r) => setTimeout(r, 5000));

          const pollRes = await client.workspaces[":workspaceId"].$get({
            param: { workspaceId },
          });
          const ws = await pollRes.json();
          status = ws.status;
          if ("failureReason" in ws && ws.failureReason) {
            failureReason = ws.failureReason as string;
          }
        }

        // Clear the progress line.
        process.stdout.write("\r" + " ".repeat(60) + "\r");

        if (status === "failed") {
          context.stderr(`Provisioning failed: ${failureReason ?? "unknown error"}`);
          return 1;
        }

        const slug = result.slug ?? workspaceId;

        if (status === "provisioning") {
          const elapsed = Math.round((Date.now() - start) / 1000);
          context.stdout(`Still provisioning after ${elapsed}s. The container may still be starting.`);
          context.stdout(`Attach when ready: lifecycle workspace shell ${slug}`);
          return 0;
        }

        context.stdout(`Workspace ready: ${slug}`);
        context.stdout("");
        context.stdout(`Next: lifecycle workspace shell ${slug}`);
        return 0;
      }

      // Local workspace — create git worktree + write to config
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

      const db = await getLifecycleDb();
      let repo = await getRepositoryByPath(db, repoPath);
      if (!repo) {
        const repoId = await insertRepository(db, { path: repoPath, name: basename(repoPath) });
        repo = { id: repoId, path: repoPath, name: basename(repoPath), manifest_path: "lifecycle.json", manifest_valid: 0, created_at: "", updated_at: "" };
      }
      await insertWorkspace(db, { repositoryId: repo.id, name, sourceRef: ref, worktreePath });

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
