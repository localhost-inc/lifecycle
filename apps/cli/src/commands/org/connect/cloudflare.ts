import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";
import { createInterface } from "node:readline";

import { readCredentials, requireActiveOrg } from "../../../credentials";
import { LifecycleCliError } from "../../../errors";
import { failCommand, jsonFlag } from "../../_shared";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function openBrowser(url: string) {
  const { exec } = await import("node:child_process");
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`);
}

const CF_TOKEN_URL = "https://dash.cloudflare.com/profile/control-plane-tokens/create";

export default defineCommand({
  description: "Connect a Cloudflare account to the active organization.",
  input: z.object({
    apiToken: z
      .string()
      .optional()
      .describe("Cloudflare API token. Prompted interactively if omitted."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const credentials = await readCredentials();
      if (!credentials) {
        throw new LifecycleCliError({
          code: "unauthenticated",
          message: "Not signed in.",
          suggestedAction: "Run `lifecycle auth login` to sign in.",
        });
      }

      const orgId = requireActiveOrg(credentials);

      let apiToken = input.apiToken;

      if (!apiToken) {
        context.stdout("Lifecycle needs a Cloudflare API token to provision cloud workspaces.");
        context.stdout("");
        context.stdout("Create a token with these permissions:");
        context.stdout("  - Workers Scripts: Edit");
        context.stdout("");
        context.stdout("Opening Cloudflare dashboard...");
        context.stdout("");

        await openBrowser(CF_TOKEN_URL);

        apiToken = await prompt("Paste your Cloudflare API token: ");

        if (!apiToken) {
          context.stdout("No token provided.");
          return 1;
        }
      }

      const { client } = await ensureBridge();
      const res = await client.organizations[":orgId"]["cloud-accounts"].$post({
        param: { orgId },
        json: { apiToken },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`Cloudflare account ${result.accountId} connected.`);
      context.stdout(`status: ${result.status}`);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
