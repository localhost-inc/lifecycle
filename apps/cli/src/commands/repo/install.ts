import { stat } from "node:fs/promises";
import path from "node:path";
import { cancel, intro, isCancel, log, multiselect, outro } from "@clack/prompts";
import { defineCommand } from "@localhost-inc/cmd";
import { z } from "zod";

import { LifecycleCliError } from "../../errors";
import {
  listRepoInstallProviders,
  runRepoInstall,
  type RepoInstallProviderId,
  type RepoInstallResult,
} from "../../integrations/repo-install";
import { failCommand, jsonFlag } from "../_shared";

async function resolveRepoPath(inputPath?: string): Promise<string> {
  const repoPath = path.resolve(inputPath ?? process.cwd());
  const candidate = await stat(repoPath).catch(() => null);
  if (!candidate?.isDirectory()) {
    throw new LifecycleCliError({
      code: "repository_not_found",
      details: { repoPath },
      message: `Lifecycle could not find a repository directory at ${repoPath}.`,
      suggestedAction: "Pass --path with a valid repository directory, then retry.",
    });
  }

  return repoPath;
}

function printResults(
  repoPath: string,
  check: boolean,
  results: RepoInstallResult[],
  stdout: (message: string) => void,
): void {
  stdout(`repo: ${repoPath}`);
  for (const result of results) {
    const relativePath = path.relative(repoPath, result.path) || path.basename(result.path);
    stdout(`${result.label}: ${result.status} (${relativePath})`);
  }
  stdout(check ? "mode: check" : "mode: install");
}

export default defineCommand({
  description: "Install merge-only repo-scoped Lifecycle harness integrations.",
  input: z.object({
    check: z
      .boolean()
      .default(false)
      .describe("Inspect repo-scoped Lifecycle harness integration without writing files."),
    json: jsonFlag,
    path: z.string().optional().describe("Repository path. Defaults to the current directory."),
  }),
  run: async (input, context) => {
    try {
      const repoPath = await resolveRepoPath(input.path);
      const providerIds =
        input.check || input.json
          ? listRepoInstallProviders().map((provider) => provider.id)
          : await selectProviders();
      if (!providerIds) {
        return 1;
      }
      if (providerIds.length === 0) {
        if (!input.json) {
          outro("No providers selected.");
        }
        return 0;
      }

      const results = runRepoInstall({
        check: input.check,
        providerIds,
        repoPath,
      });
      const ready = input.check ? results.every((result) => result.status === "installed") : true;

      if (input.json) {
        context.stdout(
          JSON.stringify(
            {
              check: input.check,
              ready,
              repoPath,
              results,
            },
            null,
            2,
          ),
        );
        return ready ? 0 : 1;
      }

      if (!input.check) {
        for (const result of results) {
          const relativePath = path.relative(repoPath, result.path) || path.basename(result.path);
          if (result.status === "unchanged") {
            log.info(`${result.label} — already up to date (${relativePath})`);
          } else {
            log.success(`${result.label} — ${result.status} ${relativePath}`);
          }
        }
        outro("Done.");
        return 0;
      }

      printResults(repoPath, input.check, results, context.stdout);
      return ready ? 0 : 1;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});

async function selectProviders(): Promise<RepoInstallProviderId[] | null> {
  intro("lifecycle repo install");

  const providers = listRepoInstallProviders();
  const selected = await multiselect({
    initialValues: providers.map((provider) => provider.id),
    message: "Configure providers:",
    options: providers.map((provider) => ({
      hint: provider.description,
      label: provider.label,
      value: provider.id,
    })),
  });

  if (isCancel(selected)) {
    cancel("Cancelled.");
    return null;
  }

  return selected as RepoInstallProviderId[];
}
