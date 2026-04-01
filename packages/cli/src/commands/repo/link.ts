import { execSync } from "node:child_process";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { createClient } from "../../rpc-client";
import { readCredentials, requireActiveOrg } from "../../credentials";
import { BridgeClientError } from "../../errors";
import { failCommand, jsonFlag } from "../_shared";

function detectGitRemote(): { owner: string; name: string } | null {
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf8" }).trim();

    const sshMatch = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (sshMatch?.[1] && sshMatch[2]) {
      return { owner: sshMatch[1], name: sshMatch[2] };
    }

    const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (httpsMatch?.[1] && httpsMatch[2]) {
      return { owner: httpsMatch[1], name: httpsMatch[2] };
    }
  } catch {
    // Not in a git repo or no remote
  }

  return null;
}

function detectDefaultBranch(): string {
  try {
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      encoding: "utf8",
    }).trim();
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    return "main";
  }
}

export default defineCommand({
  description: "Link a GitHub repository to an organization.",
  input: z.object({
    orgId: z
      .string()
      .optional()
      .describe("Organization id. Uses the active organization when omitted."),
    owner: z.string().optional().describe("GitHub repo owner. Auto-detected from git remote."),
    name: z.string().optional().describe("GitHub repo name. Auto-detected from git remote."),
    path: z.string().optional().describe("Local project path. Defaults to the current directory."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const credentials = await readCredentials();
      if (!credentials) {
        throw new BridgeClientError({
          code: "unauthenticated",
          message: "Not signed in.",
          suggestedAction: "Run `lifecycle auth login` to sign in.",
        });
      }

      const orgId = input.orgId ?? requireActiveOrg(credentials);

      let owner = input.owner;
      let repoName = input.name;

      if (!owner || !repoName) {
        const remote = detectGitRemote();
        if (!remote) {
          throw new BridgeClientError({
            code: "repository_not_linked",
            message: "Could not detect a GitHub remote. Pass --owner and --name explicitly.",
            suggestedAction:
              "Run from a git repo with an origin remote, or pass --owner and --name.",
          });
        }
        owner = owner ?? remote.owner;
        repoName = repoName ?? remote.name;
      }

      const defaultBranch = detectDefaultBranch();
      const repoPath = input.path ?? process.cwd();
      const providerRepoId = `${owner}/${repoName}`;

      const client = createClient();
      const res = await client.repos.$post({
        json: {
          organizationId: orgId,
          owner,
          name: repoName,
          providerRepoId,
          defaultBranch,
          path: repoPath,
        },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`Repository ${owner}/${repoName} linked.`);
      context.stdout(`default branch: ${result.defaultBranch}`);
      context.stdout(`status: ${result.status}`);
      context.stdout(`id: ${result.id}`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
