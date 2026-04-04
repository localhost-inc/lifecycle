import { createInterface } from "node:readline";
import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { detectEnvironment, type EnvironmentProfile } from "../env-sync";
import { readCredentials } from "../credentials";
import { failCommand, jsonFlag } from "./_shared";

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === "" || a === "y" || a === "yes");
    });
  });
}

function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`;
}

function green(text: string): string {
  return `\x1b[32m${text}\x1b[0m`;
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}

export default defineCommand({
  description: "Sync your local environment to cloud workspaces.",
  input: z.object({
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const credentials = await readCredentials();
      if (!credentials) {
        context.stderr("Not signed in. Run `lifecycle auth login` first.");
        return 1;
      }

      context.stdout("");
      context.stdout(`  ${dim("Scanning local environment...")}`);
      context.stdout("");

      const profile = detectEnvironment();

      if (input.json) {
        context.stdout(JSON.stringify({
          git: profile.git ? { name: profile.git.name, email: profile.git.email, aliases: profile.git.aliasCount } : null,
          claude: profile.claude ? { authenticated: true, plan: profile.claude.subscriptionType } : null,
          codex: profile.codex ? { authenticated: true } : null,
          claudeConfig: profile.claudeConfig ? { found: true } : null,
        }, null, 2));
        return 0;
      }

      // Interactive survey
      const accepted: Partial<EnvironmentProfile> = {};
      let anyAccepted = false;

      // Git
      if (profile.git) {
        context.stdout(`  ${bold("Git")}`);
        context.stdout(`    ${profile.git.name} <${profile.git.email}>`);
        if (profile.git.aliasCount > 0) {
          context.stdout(`    ${dim(`${profile.git.aliasCount} aliases`)}`);
        }
        if (await confirm(`    ${green("✓")} Sync git config? (Y/n) `)) {
          accepted.git = profile.git;
          anyAccepted = true;
        }
        context.stdout("");
      } else {
        context.stdout(`  ${bold("Git")}  ${dim("no .gitconfig found")}`);
        context.stdout("");
      }

      // Claude
      if (profile.claude) {
        context.stdout(`  ${bold("Claude Code")}`);
        const plan = profile.claude.subscriptionType ?? "authenticated";
        context.stdout(`    ${dim(plan)}`);
        if (await confirm(`    ${green("✓")} Sync credentials? (Y/n) `)) {
          accepted.claude = profile.claude;
          accepted.claudeConfig = profile.claudeConfig;
          anyAccepted = true;
        }
        context.stdout("");
      } else {
        context.stdout(`  ${bold("Claude Code")}  ${dim("no credentials found")}`);
        context.stdout("");
      }

      // Codex
      if (profile.codex) {
        context.stdout(`  ${bold("Codex")}`);
        context.stdout(`    ${dim("authenticated")}`);
        if (await confirm(`    ${green("✓")} Sync credentials? (Y/n) `)) {
          accepted.codex = profile.codex;
          anyAccepted = true;
        }
        context.stdout("");
      } else {
        context.stdout(`  ${bold("Codex")}  ${dim("no credentials found")}`);
        context.stdout("");
      }

      if (!anyAccepted) {
        context.stdout("  Nothing to sync.");
        return 0;
      }

      // Upload profile to API
      const { client } = await ensureBridge();
      await client.users.me.environment.$put({
        json: {
          git: accepted.git ? {
            name: accepted.git.name,
            email: accepted.git.email,
            configBase64: accepted.git.configBase64,
          } : undefined,
          claude: accepted.claude ? {
            accessToken: accepted.claude.accessToken,
            refreshToken: accepted.claude.refreshToken,
          } : undefined,
          claudeConfig: accepted.claudeConfig ? {
            settingsBase64: accepted.claudeConfig.settingsBase64,
          } : undefined,
          codex: accepted.codex ? {
            authBase64: accepted.codex.authBase64,
          } : undefined,
        },
      });

      context.stdout(`  ${green("✓")} Environment synced. Cloud workspaces will feel like home.`);
      context.stdout("");

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
