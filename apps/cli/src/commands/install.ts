import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { cancel, intro, isCancel, multiselect, outro, select } from "@clack/prompts";
import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { resolveCurrentCliInvocation } from "@/runtime/self";
import { z } from "zod";

import { LifecycleCliError } from "../errors";
import { failCommand, jsonFlag } from "./_shared";

const documentScopeFlag = z
  .enum(["project", "user"])
  .optional()
  .describe("Managed document scope. Defaults to project for non-interactive runs.");

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

function defaultDocumentScope(inputScope?: "project" | "user"): "project" | "user" {
  return inputScope ?? "project";
}

async function selectDocumentScope(): Promise<"project" | "user" | null> {
  intro("lifecycle install");

  const selected = await select({
    initialValue: "project",
    message: "Where should Lifecycle manage AGENTS.md and CLAUDE.md guidance?",
    options: [
      {
        hint: "Write managed blocks into AGENTS.md and CLAUDE.md in this repository.",
        label: "This project",
        value: "project",
      },
      {
        hint: "Write managed blocks into AGENTS.md and CLAUDE.md in your home directory.",
        label: "My user account",
        value: "user",
      },
    ],
  });

  if (isCancel(selected)) {
    cancel("Cancelled.");
    return null;
  }

  return selected as "project" | "user";
}

function statusLabel(status: string, requiresElevation: boolean): string {
  if (requiresElevation) {
    return `${status} · requires elevation`;
  }
  return status;
}

async function selectSteps(inspection: {
  steps: Array<{
    detail: string | null;
    id: "agents-md" | "claude-code" | "claude-md" | "codex" | "proxy";
    label: string;
    requires_elevation: boolean;
    selected_by_default: boolean;
    status: string;
  }>;
}): Promise<Array<"agents-md" | "claude-code" | "claude-md" | "codex" | "proxy"> | null> {
  const selectableSteps = inspection.steps.filter((step) => step.status !== "unsupported");
  if (selectableSteps.length === 0) {
    outro("Nothing to configure from this surface.");
    return [];
  }

  const selected = await multiselect({
    initialValues: selectableSteps
      .filter((step) => step.selected_by_default)
      .map((step) => step.id),
    message: "Choose what Lifecycle should configure:",
    options: selectableSteps.map((step) => ({
      hint: [statusLabel(step.status, step.requires_elevation), step.detail]
        .filter((value): value is string => Boolean(value))
        .join(" — "),
      label: step.label,
      value: step.id,
    })),
  });

  if (isCancel(selected)) {
    cancel("Cancelled.");
    return null;
  }

  return selected;
}

function printInspection(
  inspection: {
    document_scope: "project" | "user";
    ready: boolean;
    repo_path: string | null;
    steps: Array<{
      detail: string | null;
      label: string;
      requires_elevation: boolean;
      scope: "machine" | "repository" | "user";
      status: string;
    }>;
  },
  stdout: (message: string) => void,
): void {
  if (inspection.repo_path) {
    stdout(`repo: ${inspection.repo_path}`);
  }
  stdout(`managed docs: ${inspection.document_scope}`);
  for (const step of inspection.steps) {
    const suffix = step.detail ? ` — ${step.detail}` : "";
    const elevation = step.requires_elevation ? " · requires elevation" : "";
    stdout(`${step.scope}: ${step.label} — ${step.status}${elevation}${suffix}`);
  }
}

function printApplyResult(
  result: {
    detail: string | null;
    label: string;
    scope: "machine" | "repository" | "user";
    status: string;
  },
  stdout: (message: string) => void,
): void {
  const suffix = result.detail ? ` — ${result.detail}` : "";
  stdout(`${result.scope}: ${result.label} — ${result.status}${suffix}`);
}

function shouldRunLocalProxyInstall(
  selectedStepIds: string[],
  apply: { steps: Array<{ id: string; status: string }> },
): boolean {
  if (!selectedStepIds.includes("proxy")) {
    return false;
  }

  return apply.steps.some((step) => step.id === "proxy" && step.status === "requires_elevation");
}

function runLocalProxyInstall(): number {
  const cli = resolveCurrentCliInvocation();
  const result = spawnSync(cli.binary, [...cli.argsPrefix, "proxy", "install"], {
    env: process.env,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

export default defineCommand({
  description: "Run the Lifecycle setup wizard for proxy, harness integrations, and managed docs.",
  input: z.object({
    check: z
      .boolean()
      .default(false)
      .describe("Inspect Lifecycle install status without changing files."),
    documentScope: documentScopeFlag,
    json: jsonFlag,
    path: z.string().optional().describe("Repository path. Defaults to the current directory."),
    yes: z
      .boolean()
      .default(false)
      .describe("Apply the default recommended install steps without prompting."),
  }),
  run: async (input, context) => {
    try {
      const repoPath = await resolveRepoPath(input.path);
      const documentScope =
        input.check || input.json || input.yes
          ? defaultDocumentScope(input.documentScope)
          : ((await selectDocumentScope()) ?? null);
      if (!documentScope) {
        return 1;
      }

      const { client } = await ensureBridge();
      const inspectionResponse = await client.install.$get({
        query: {
          document_scope: documentScope,
          path: repoPath,
        },
      });
      const inspection = await inspectionResponse.json();

      if (input.json && !input.yes) {
        context.stdout(JSON.stringify(inspection, null, 2));
        return inspection.ready ? 0 : 1;
      }

      if (input.check) {
        printInspection(inspection, context.stdout);
        return inspection.ready ? 0 : 1;
      }

      const selectedStepIds = input.yes
        ? inspection.steps.filter((step) => step.selected_by_default).map((step) => step.id)
        : await selectSteps(inspection);
      if (selectedStepIds === null) {
        return 1;
      }
      if (selectedStepIds.length === 0) {
        outro(inspection.ready ? "Lifecycle is already configured." : "No install steps selected.");
        return 0;
      }

      const applyResponse = await client.install.apply.$post({
        json: {
          document_scope: documentScope,
          path: repoPath,
          step_ids: selectedStepIds,
        },
      });
      const apply = await applyResponse.json();

      if (input.json) {
        context.stdout(JSON.stringify(apply, null, 2));
        return apply.ready ? 0 : 1;
      }

      for (const step of apply.steps) {
        printApplyResult(step, context.stdout);
      }

      let ready = apply.ready;
      if (shouldRunLocalProxyInstall(selectedStepIds, apply)) {
        context.stdout("machine: Local preview proxy — delegating to privileged installer...");
        const proxyCode = runLocalProxyInstall();
        if (proxyCode !== 0) {
          return proxyCode;
        }

        const refreshedInspectionResponse = await client.install.$get({
          query: {
            document_scope: documentScope,
            path: repoPath,
          },
        });
        const refreshedInspection = await refreshedInspectionResponse.json();
        ready = refreshedInspection.ready;
      }

      outro(
        ready
          ? "Lifecycle install complete."
          : "Lifecycle install finished with follow-up remaining.",
      );
      return ready ? 0 : 1;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
