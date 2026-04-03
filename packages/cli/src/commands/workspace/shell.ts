import { spawn } from "node:child_process";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { getLifecycleDb } from "@lifecycle/db";
import { getWorkspaceById } from "@lifecycle/db/queries";
import { z } from "zod";

import { getWorkspaceClientRegistry } from "../../workspace-registry";
import { gatherEnvironment } from "../../env-sync";
import { failCommand, jsonFlag } from "../_shared";

function createCloudWorkspaceRecord(workspaceId: string): WorkspaceRecord {
  return {
    id: workspaceId,
    repository_id: "cloud",
    name: workspaceId,
    checkout_type: "worktree",
    source_ref: workspaceId,
    git_sha: null,
    worktree_path: null,
    host: "cloud",
    manifest_fingerprint: null,
    created_at: "",
    updated_at: "",
    last_active_at: "",
    prepared_at: null,
    status: "active",
    failure_reason: null,
    failed_at: null,
  };
}

async function resolveWorkspaceRecord(workspaceId: string): Promise<WorkspaceRecord> {
  const db = await getLifecycleDb();
  const workspace = await getWorkspaceById(db, workspaceId);
  if (workspace) {
    return {
      id: workspace.id,
      repository_id: workspace.repository_id,
      name: workspace.name,
      checkout_type: workspace.checkout_type === "root" ? "root" : "worktree",
      source_ref: workspace.source_ref,
      git_sha: workspace.git_sha,
      worktree_path: workspace.worktree_path,
      host: workspace.host === "cloud" ? "cloud" : workspace.host === "docker"
        ? "docker"
        : workspace.host === "remote"
        ? "remote"
        : "local",
      manifest_fingerprint: workspace.manifest_fingerprint ?? null,
      created_at: workspace.created_at,
      updated_at: workspace.updated_at,
      last_active_at: workspace.last_active_at,
      prepared_at: workspace.prepared_at ?? null,
      status: workspace.status === "archived"
        ? "archived"
        : workspace.status === "archiving"
        ? "archiving"
        : workspace.status === "failed"
        ? "failed"
        : workspace.status === "provisioning"
        ? "provisioning"
        : "active",
      failure_reason: workspace.failure_reason === "capacity_unavailable"
        || workspace.failure_reason === "environment_task_failed"
        || workspace.failure_reason === "local_app_not_running"
        || workspace.failure_reason === "local_docker_unavailable"
        || workspace.failure_reason === "local_port_conflict"
        || workspace.failure_reason === "manifest_invalid"
        || workspace.failure_reason === "operation_timeout"
        || workspace.failure_reason === "prepare_step_failed"
        || workspace.failure_reason === "repo_clone_failed"
        || workspace.failure_reason === "repository_disconnected"
        || workspace.failure_reason === "sandbox_unreachable"
        || workspace.failure_reason === "service_healthcheck_failed"
        || workspace.failure_reason === "service_start_failed"
        || workspace.failure_reason === "unknown"
        ? workspace.failure_reason
        : null,
      failed_at: workspace.failed_at,
    };
  }

  return createCloudWorkspaceRecord(workspaceId);
}

function runLaunchSpec(
  spec: {
    program: string;
    args: string[];
    cwd: string | null;
    env: Array<[string, string]>;
  },
  stdio: "ignore" | "inherit",
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(spec.program, spec.args, {
      stdio,
      cwd: spec.cwd ?? undefined,
      env: {
        ...process.env,
        ...Object.fromEntries(spec.env),
      },
    });

    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}

export default defineCommand({
  description: "Open a shell in a workspace.",
  input: z.object({
    args: z.array(z.string()).describe("<workspace>"),
    json: jsonFlag,
    tmuxSession: defineFlag(
      z.string().optional().describe("Persistent tmux session name to create or attach before the shell opens."),
      { aliases: "t" },
    ),
  }),
  run: async (input, context) => {
    try {
      const workspaceId = input.args[0];
      if (!workspaceId) {
        context.stderr("Usage: lifecycle workspace shell <workspace>");
        return 1;
      }

      const workspace = await resolveWorkspaceRecord(workspaceId);
      const runtime = await getWorkspaceClientRegistry().resolve(workspace.host).resolveShellRuntime(
        workspace,
        {
          sessionName: input.tmuxSession ?? null,
          syncEnvironment: gatherEnvironment(),
        },
      );

      if (input.json) {
        context.stdout(JSON.stringify({
          workspace: {
            host: workspace.host,
            id: workspace.id,
            worktreePath: workspace.worktree_path,
          },
          shell: runtime,
        }, null, 2));
        return runtime.launchError || !runtime.spec ? 1 : 0;
      }

      if (runtime.launchError || !runtime.spec) {
        context.stderr(runtime.launchError ?? "Lifecycle could not resolve a shell runtime.");
        return 1;
      }

      if (runtime.prepare) {
        const prepareExitCode = await runLaunchSpec(runtime.prepare, "ignore");
        if (prepareExitCode !== 0) {
          context.stderr(`Shell prepare step failed with exit code ${prepareExitCode}.`);
          return prepareExitCode;
        }
      }

      return await runLaunchSpec(runtime.spec, "inherit");
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
