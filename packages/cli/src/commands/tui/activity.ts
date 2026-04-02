import { defineCommand } from "@lifecycle/cmd";
import { getLifecycleDb } from "@lifecycle/db";
import { listRepositoriesWithWorkspaces } from "@lifecycle/db/queries";
import { z } from "zod";

import type { WorkspaceHost } from "@lifecycle/contracts";
import { getWorkspaceClientRegistry } from "../../workspace-registry";

const IDLE_SHELLS = new Set([
  "bash", "zsh", "fish", "sh", "dash", "ksh", "tcsh", "csh", "nu",
  "-bash", "-zsh", "-fish", "-sh", "login",
]);

export default defineCommand({
  description: "Poll workspace activity across all hosts.",
  input: z.object({}),
  run: async (_input, context) => {
    const db = await getLifecycleDb();
    const repos = await listRepositoriesWithWorkspaces(db);
    const registry = getWorkspaceClientRegistry();

    const checks = repos.flatMap((repo) =>
      repo.workspaces.map((ws) => ({
        id: ws.id,
        repo: repo.name,
        name: ws.name,
        host: (ws.host ?? "local") as WorkspaceHost,
        sessionName: tmuxSessionName(repo.name, ws.name),
        worktreePath: ws.worktree_path,
        repositoryId: repo.id,
      })),
    );

    const results = await Promise.all(
      checks.map(async (ws) => {
        const client = registry.resolve(ws.host);
        const wsRecord = {
          id: ws.id,
          repository_id: ws.repositoryId,
          name: ws.name,
          checkout_type: "worktree" as const,
          source_ref: "",
          git_sha: null,
          worktree_path: ws.worktreePath,
          host: ws.host,
          created_at: "",
          updated_at: "",
          last_active_at: "",
          status: "active" as const,
          failure_reason: null,
          failed_at: null,
        };

        // Step 1: Check what process is in the foreground of the tmux pane.
        const fgResult = await client.execCommand(wsRecord, [
          "tmux", "list-panes", "-t", ws.sessionName,
          "-F", "#{pane_current_command} #{pane_pid}",
        ]);

        if (fgResult.exitCode !== 0) {
          return { id: ws.id, repo: ws.repo, name: ws.name, busy: false };
        }

        const firstLine = fgResult.stdout.trim().split("\n")[0]?.trim() ?? "";
        const [fgCommand, panePidStr] = firstLine.split(" ");

        if (!fgCommand || !panePidStr) {
          return { id: ws.id, repo: ws.repo, name: ws.name, busy: false };
        }

        // If the foreground process is a shell, the workspace is idle.
        if (IDLE_SHELLS.has(fgCommand)) {
          return { id: ws.id, repo: ws.repo, name: ws.name, busy: false };
        }

        // Step 2: A non-shell process is in the foreground (e.g. claude, codex).
        // Check if it has active child processes — this indicates tool execution
        // or subprocess work, which is the main "busy" signal.
        const childResult = await client.execCommand(wsRecord, [
          "pgrep", "-P", panePidStr,
        ]);

        if (childResult.exitCode !== 0 || !childResult.stdout.trim()) {
          // The shell has no children at all — shouldn't happen if fgCommand
          // is non-shell, but treat as idle.
          return { id: ws.id, repo: ws.repo, name: ws.name, busy: false };
        }

        // The shell's direct child is the agent process. Check if THAT process
        // has its own children (tool calls, subprocesses).
        const agentPid = childResult.stdout.trim().split("\n")[0]?.trim();
        if (!agentPid) {
          return { id: ws.id, repo: ws.repo, name: ws.name, busy: false };
        }

        const grandchildResult = await client.execCommand(wsRecord, [
          "pgrep", "-P", agentPid,
        ]);

        const busy = grandchildResult.exitCode === 0 && grandchildResult.stdout.trim().length > 0;
        return { id: ws.id, repo: ws.repo, name: ws.name, busy };
      }),
    );

    context.stdout(JSON.stringify({ workspaces: results }));
    return 0;
  },
});

function tmuxSessionName(repoName: string, workspaceName: string): string {
  const ws = slugify(workspaceName).slice(0, 30);
  const repo = slugify(repoName).slice(0, 30);
  return repo ? `${repo}-${ws}` : ws;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
