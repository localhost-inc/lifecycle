import { createRoute } from "routedjs";
import { z } from "zod";
import { isMissingLifecycleSchemaError } from "@lifecycle/db";
import { listRepositoriesWithWorkspaces } from "@lifecycle/db/queries";
import type { WorkspaceHost, WorkspaceRecord } from "@lifecycle/contracts";

import { buildTmuxSessionName } from "../../../src/tmux";

export default createRoute({
  schemas: {
    params: z.object({ id: z.string().min(1) }),
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    const workspace = await resolveWorkspaceScope(db, params.id);
    const shell = await buildShellResult(workspace, workspaceRegistry);

    return { workspace, shell };
  },
});

export interface WorkspaceScopeResult {
  binding: "bound" | "adhoc";
  workspace_id: string | null;
  workspace_name: string;
  repo_name: string | null;
  host: WorkspaceHost | "unknown";
  status: string | null;
  source_ref: string | null;
  cwd: string | null;
  worktree_path: string | null;
  services: Array<{ name: string; preview_url: string | null; status: string }>;
  resolution_note: string | null;
  resolution_error: string | null;
}

async function resolveWorkspaceScope(
  db: import("@lifecycle/db").SqlDriver,
  workspaceId: string,
): Promise<WorkspaceScopeResult> {
  const repositories = await listRepositoriesWithWorkspaces(db).catch((error) => {
    if (isMissingLifecycleSchemaError(error)) {
      return [];
    }
    throw error;
  });

  for (const repo of repositories) {
    const ws = repo.workspaces.find((w) => w.id === workspaceId);
    if (ws) {
      return {
        binding: "bound",
        workspace_id: workspaceId,
        workspace_name: ws.name,
        repo_name: repo.name,
        host: normalizeHost(ws.host),
        status: ws.status,
        source_ref: ws.source_ref,
        cwd: ws.worktree_path,
        worktree_path: ws.worktree_path,
        services: [],
        resolution_note: "Resolved from local database.",
        resolution_error: null,
      };
    }
  }

  return {
    binding: "bound",
    workspace_id: workspaceId,
    workspace_name: workspaceId,
    repo_name: null,
    host: "unknown",
    status: null,
    source_ref: null,
    cwd: null,
    worktree_path: null,
    services: [],
    resolution_note: null,
    resolution_error: `Could not resolve workspace "${workspaceId}".`,
  };
}

async function buildShellResult(
  workspace: WorkspaceScopeResult,
  workspaceRegistry: import("@lifecycle/workspace").WorkspaceClientRegistry,
) {
  if (workspace.resolution_error) {
    return {
      backend_label: "unavailable",
      launch_error: workspace.resolution_error,
      persistent: false,
      session_name: null,
      prepare: null,
      spec: null,
    };
  }

  const record = toWorkspaceRecord(workspace);
  if (!record) {
    return {
      backend_label: "unknown shell",
      launch_error: "Could not resolve a shell for this workspace host.",
      persistent: false,
      session_name: null,
      prepare: null,
      spec: null,
    };
  }

  try {
    const runtime = await workspaceRegistry.resolve(record.host).resolveShellRuntime(
      record,
      {
        cwd: workspace.cwd ?? workspace.worktree_path,
        sessionName: buildTmuxSessionName(workspace),
      },
    );

    return {
      backend_label: runtime.backendLabel,
      launch_error: runtime.launchError,
      persistent: runtime.persistent,
      session_name: runtime.sessionName,
      prepare: runtime.prepare,
      spec: runtime.spec,
    };
  } catch (error) {
    return {
      backend_label: `${workspace.host} shell`,
      launch_error: error instanceof Error ? error.message : String(error),
      persistent: false,
      session_name: null,
      prepare: null,
      spec: null,
    };
  }
}

function toWorkspaceRecord(workspace: WorkspaceScopeResult): WorkspaceRecord | null {
  const host = workspace.host;
  if (host === "unknown" || !workspace.workspace_id) return null;

  return {
    id: workspace.workspace_id,
    repository_id: "bridge",
    name: workspace.workspace_name,
    checkout_type: "worktree",
    source_ref: workspace.source_ref ?? workspace.workspace_name,
    git_sha: null,
    worktree_path: workspace.cwd ?? workspace.worktree_path ?? null,
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
