import { defineCommand } from "@lifecycle/cmd";
import { getLifecycleDb } from "@lifecycle/db";
import { listRepositoriesWithWorkspaces } from "@lifecycle/db/queries";
import { z } from "zod";

import { createClient } from "../../rpc-client";
import { readCredentials } from "../../credentials";
import { failCommand, jsonFlag } from "../_shared";

interface WorkspaceEntry {
  id: string;
  name: string;
  host: string;
  status: string;
  ref?: string | undefined;
  path?: string | undefined;
}

interface RepoEntry {
  name: string;
  source: "local" | "cloud";
  path?: string | undefined;
  owner?: string | undefined;
  status?: string | undefined;
  workspaces?: WorkspaceEntry[] | undefined;
}

export default defineCommand({
  description: "List repositories (local and cloud).",
  input: z.object({
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const repos: RepoEntry[] = [];

      // Local repositories from db (includes workspaces)
      const db = await getLifecycleDb();
      const localRepos = await listRepositoriesWithWorkspaces(db);
      for (const localRepo of localRepos) {
        repos.push({
          name: localRepo.name,
          source: "local",
          path: localRepo.path,
          workspaces: localRepo.workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            host: w.host,
            status: w.status,
            ...(w.source_ref ? { ref: w.source_ref } : {}),
            ...(w.worktree_path ? { path: w.worktree_path } : {}),
          })),
        });
      }

      // Remote repositories from API (if authenticated)
      const credentials = await readCredentials();
      if (credentials?.activeOrgId) {
        try {
          const client = createClient();
          const res = await client.repos.$get({ query: { organizationId: credentials.activeOrgId } });
          const { repositories } = await res.json();
          for (const repo of repositories) {
            repos.push({
              name: `${repo.owner}/${repo.name}`,
              source: "cloud",
              owner: repo.owner,
              status: repo.status,
            });
          }
        } catch {
          // API not reachable — show local only
        }
      }

      if (input.json) {
        context.stdout(JSON.stringify({ repositories: repos }, null, 2));
        return 0;
      }

      if (repos.length === 0) {
        context.stdout("No repositories. Run `lifecycle repo init` in a project directory to add one.");
        return 0;
      }

      for (const repo of repos) {
        const suffix = repo.source === "local" ? repo.path : repo.status ?? "";
        context.stdout(`${repo.name} (${repo.source}) ${suffix}`);
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
