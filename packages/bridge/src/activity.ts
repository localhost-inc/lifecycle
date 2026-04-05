import { getLifecycleDb, isMissingLifecycleSchemaError } from "@lifecycle/db";
import { listRepositoriesWithWorkspaces } from "@lifecycle/db/queries";
import type { WorkspaceHost, WorkspaceRecord } from "@lifecycle/contracts";

import { getWorkspaceRegistry, broadcastMessage } from "./server";
import { buildTmuxSessionName } from "./tmux";

const POLL_INTERVAL_MS = 1000;

const IDLE_SHELLS = new Set([
  "bash",
  "zsh",
  "fish",
  "sh",
  "dash",
  "ksh",
  "tcsh",
  "csh",
  "nu",
  "-bash",
  "-zsh",
  "-fish",
  "-sh",
  "login",
]);
const ACTIVITY_GATED_FOREGROUND_COMMANDS = new Set(["claude", "codex"]);
const AGENT_ACTIVITY_WINDOW_SECS = 5;
const VERSION_LIKE_RE = /^\d+\.\d+/;

export interface WorkspaceActivityEntry {
  id: string;
  repo: string;
  name: string;
  busy: boolean;
  activity_at: number | null;
}

let lastState = new Map<string, boolean>();

export async function pollActivity(): Promise<WorkspaceActivityEntry[]> {
  const db = await getLifecycleDb();
  const workspaceRegistry = getWorkspaceRegistry();

  const repos = await listRepositoriesWithWorkspaces(db).catch((error) => {
    if (isMissingLifecycleSchemaError(error)) return [];
    throw error;
  });

  const checks = repos.flatMap((repo) =>
    repo.workspaces.map((ws) => ({
      workspace: stubWorkspaceRecord(ws.host as WorkspaceHost, ws.id, ws.name, ws.worktree_path),
      id: ws.id,
      repo: repo.name,
      name: ws.name,
      host: normalizeHost(ws.host),
      sessionName: buildTmuxSessionName({
        workspace_id: ws.id,
        workspace_name: ws.name,
        repo_name: repo.name,
        host: normalizeHost(ws.host),
        cwd: ws.worktree_path ?? null,
      }),
    })),
  );

  return Promise.all(
    checks.map(async (check) => {
      try {
        const client = workspaceRegistry.resolve(check.host);
        const result = await client.execCommand(check.workspace, [
          "tmux",
          "list-panes",
          "-t",
          check.sessionName,
          "-F",
          "#{pane_current_command}\t#{window_activity}",
        ]);

        if (result.exitCode !== 0) {
          return {
            id: check.id,
            repo: check.repo,
            name: check.name,
            busy: false,
            activity_at: null,
          };
        }

        return {
          id: check.id,
          repo: check.repo,
          name: check.name,
          ...parseTmuxPaneActivity(result.stdout),
        };
      } catch {
        return { id: check.id, repo: check.repo, name: check.name, busy: false, activity_at: null };
      }
    }),
  );
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startActivityPoller(): void {
  if (timer) return;

  timer = setInterval(async () => {
    try {
      const workspaces = await pollActivity();
      const nextState = new Map<string, boolean>();
      const changed: WorkspaceActivityEntry[] = [];

      for (const ws of workspaces) {
        nextState.set(ws.id, ws.busy);
        if (lastState.get(ws.id) !== ws.busy) {
          changed.push(ws);
        }
      }

      // Detect removed workspaces
      for (const id of lastState.keys()) {
        if (!nextState.has(id)) {
          changed.push({ id, repo: "", name: "", busy: false, activity_at: null });
        }
      }

      lastState = nextState;

      if (changed.length > 0) {
        broadcastMessage(
          {
            type: "activity",
            workspaces,
          },
          "activity",
        );
      }
    } catch {
      // swallow errors — poll will retry
    }
  }, POLL_INTERVAL_MS);
}

export function stopActivityPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseTmuxPaneActivity(
  stdout: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): { busy: boolean; activity_at: number | null } {
  let busy = false;
  let activityAt: number | null = null;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const [command = "", activity = ""] = line.split("\t");
    const parsedActivity = Number.parseInt(activity, 10);
    if (Number.isFinite(parsedActivity)) {
      activityAt = activityAt === null ? parsedActivity : Math.max(activityAt, parsedActivity);
    }

    if (!command || IDLE_SHELLS.has(command)) continue;

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

function normalizeHost(host: string): WorkspaceHost {
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

function stubWorkspaceRecord(
  host: WorkspaceHost,
  id: string,
  name: string,
  worktreePath: string | null,
): WorkspaceRecord {
  return {
    id,
    repository_id: "bridge",
    name,
    checkout_type: "worktree",
    source_ref: name,
    git_sha: null,
    worktree_path: worktreePath,
    host,
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
