import { defineCommand } from "@lifecycle/cmd";
import type {
  WorkspaceCheckoutType,
  WorkspaceFailureReason,
  WorkspaceHost,
  WorkspaceRecord,
  WorkspaceStatus,
} from "@lifecycle/contracts";
import { getLifecycleDb } from "@lifecycle/db";
import { listRepositoriesWithWorkspaces } from "@lifecycle/db/queries";
import { z } from "zod";

import { buildTmuxSessionName, type WorkspaceScope } from "../../tui-session";
import { getWorkspaceClientRegistry } from "../../workspace-registry";

const IDLE_SHELLS = new Set([
  "bash", "zsh", "fish", "sh", "dash", "ksh", "tcsh", "csh", "nu",
  "-bash", "-zsh", "-fish", "-sh", "login",
]);

const ACTIVITY_GATED_FOREGROUND_COMMANDS = new Set([
  "claude", "codex",
]);

const AGENT_ACTIVITY_WINDOW_SECS = 5;

/** Matches version-like process titles (e.g. "2.1.91") set by Node CLIs. */
const VERSION_LIKE_RE = /^\d+\.\d+/;

export default defineCommand({
  description: "Poll workspace activity across all hosts.",
  input: z.object({}),
  run: async (_input, context) => {
    const db = await getLifecycleDb();
    const repos = await listRepositoriesWithWorkspaces(db);
    const registry = getWorkspaceClientRegistry();

    const checks = repos.flatMap((repo) =>
      repo.workspaces.map((ws) => ({
        workspace: toWorkspaceRecord(ws),
        id: ws.id,
        repo: repo.name,
        name: ws.name,
        host: normalizeWorkspaceHost(ws.host),
        sessionName: buildTmuxSessionName({
          binding: "adhoc",
          workspace_id: ws.id,
          workspace_name: ws.name,
          repo_name: repo.name,
          host: normalizeWorkspaceHost(ws.host),
          status: ws.status ?? "active",
          source_ref: ws.source_ref,
          cwd: ws.worktree_path,
          worktree_path: ws.worktree_path,
          services: [],
          resolution_note: null,
          resolution_error: null,
        } satisfies WorkspaceScope),
      })),
    );

    const results = await Promise.all(
      checks.map(async (ws) => {
        let fgResult;
        try {
          const client = registry.resolve(ws.host);
          fgResult = await client.execCommand(ws.workspace, [
            "tmux",
            "list-panes",
            "-t",
            ws.sessionName,
            "-F",
            "#{pane_current_command}\t#{window_activity}",
          ]);
        } catch {
          return {
            id: ws.id,
            repo: ws.repo,
            name: ws.name,
            busy: false,
            activity_at: null,
          };
        }

        if (fgResult.exitCode !== 0) {
          return {
            id: ws.id,
            repo: ws.repo,
            name: ws.name,
            busy: false,
            activity_at: null,
          };
        }

        return {
          id: ws.id,
          repo: ws.repo,
          name: ws.name,
          ...parseTmuxPaneActivity(fgResult.stdout),
        };
      }),
    );

    context.stdout(JSON.stringify({ workspaces: results }));
    return 0;
  },
});

export function parseTmuxPaneActivity(
  stdout: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): {
  activity_at: number | null;
  busy: boolean;
} {
  let busy = false;
  let activityAt: number | null = null;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const [command = "", activity = ""] = line.split("\t");
    const parsedActivity = Number.parseInt(activity, 10);
    if (Number.isFinite(parsedActivity)) {
      activityAt = activityAt === null
        ? parsedActivity
        : Math.max(activityAt, parsedActivity);
    }

    if (!command || IDLE_SHELLS.has(command)) {
      continue;
    }

    // Node CLIs (e.g. Claude Code) often set process.title to their version
    // number, so tmux reports "2.1.91" instead of "claude". Treat these the
    // same as activity-gated commands.
    if (ACTIVITY_GATED_FOREGROUND_COMMANDS.has(command) || VERSION_LIKE_RE.test(command)) {
      if (
        Number.isFinite(parsedActivity) &&
        nowEpochSeconds - parsedActivity <= AGENT_ACTIVITY_WINDOW_SECS
      ) {
        busy = true;
      }
      continue;
    }

    busy = true;
  }

  return { busy, activity_at: activityAt };
}

function normalizeWorkspaceHost(host: string): WorkspaceHost {
  switch (host) {
    case "cloud":
    case "docker":
    case "local":
    case "remote":
      return host;
    default:
      return "local";
  }
}

function normalizeCheckoutType(checkoutType: string): WorkspaceCheckoutType {
  return checkoutType === "root" ? "root" : "worktree";
}

function normalizeStatus(status: string): WorkspaceStatus {
  switch (status) {
    case "active":
    case "archived":
    case "archiving":
    case "failed":
    case "provisioning":
      return status;
    default:
      return "active";
  }
}

function normalizeFailureReason(reason: string | null): WorkspaceFailureReason | null {
  switch (reason) {
    case "capacity_unavailable":
    case "environment_task_failed":
    case "local_app_not_running":
    case "local_docker_unavailable":
    case "local_port_conflict":
    case "manifest_invalid":
    case "operation_timeout":
    case "prepare_step_failed":
    case "repo_clone_failed":
    case "repository_disconnected":
    case "sandbox_unreachable":
    case "service_healthcheck_failed":
    case "service_start_failed":
    case "unknown":
      return reason;
    default:
      return null;
  }
}

function toWorkspaceRecord(workspace: {
  checkout_type: string;
  created_at: string;
  failed_at: string | null;
  failure_reason: string | null;
  git_sha: string | null;
  host: string;
  id: string;
  last_active_at: string;
  manifest_fingerprint?: string | null;
  name: string;
  prepared_at?: string | null;
  repository_id: string;
  source_ref: string;
  status: string;
  updated_at: string;
  worktree_path: string | null;
}): WorkspaceRecord {
  return {
    id: workspace.id,
    repository_id: workspace.repository_id,
    name: workspace.name,
    checkout_type: normalizeCheckoutType(workspace.checkout_type),
    source_ref: workspace.source_ref,
    git_sha: workspace.git_sha,
    worktree_path: workspace.worktree_path,
    host: normalizeWorkspaceHost(workspace.host),
    manifest_fingerprint: workspace.manifest_fingerprint ?? null,
    created_at: workspace.created_at,
    updated_at: workspace.updated_at,
    last_active_at: workspace.last_active_at,
    prepared_at: workspace.prepared_at ?? null,
    status: normalizeStatus(workspace.status),
    failure_reason: normalizeFailureReason(workspace.failure_reason),
    failed_at: workspace.failed_at,
  };
}
