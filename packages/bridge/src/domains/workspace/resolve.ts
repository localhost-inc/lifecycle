import type { WorkspaceHost, WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { getRepositoryById, getWorkspaceRecordById } from "@lifecycle/db/queries";
import { BridgeError } from "../../lib/errors";

export interface WorkspaceScope {
  binding: "bound" | "adhoc";
  workspace_id: string | null;
  workspace_name: string;
  repo_name: string | null;
  host: WorkspaceHost | "unknown";
  status: string | null;
  source_ref: string | null;
  cwd: string | null;
  workspace_root: string | null;
  resolution_note: string | null;
  resolution_error: string | null;
}

export function normalizeWorkspaceHost(host: string | null | undefined): WorkspaceHost {
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

export async function resolveWorkspaceScope(
  db: SqlDriver,
  workspaceId: string,
): Promise<WorkspaceScope> {
  const workspace = await getWorkspaceRecordById(db, workspaceId);
  if (workspace) {
    const repository = await getRepositoryById(db, workspace.repository_id);
    return {
      binding: "bound",
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      repo_name: repository?.name ?? null,
      host: normalizeWorkspaceHost(workspace.host),
      status: workspace.status,
      source_ref: workspace.source_ref,
      cwd: workspace.workspace_root,
      workspace_root: workspace.workspace_root,
      resolution_note: "Resolved from local database.",
      resolution_error: null,
    };
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
    workspace_root: null,
    resolution_note: null,
    resolution_error: `Could not resolve workspace "${workspaceId}".`,
  };
}

export async function resolveWorkspaceRecord(
  db: SqlDriver,
  workspaceId: string,
): Promise<WorkspaceRecord> {
  const record = await getWorkspaceRecordById(db, workspaceId);
  if (!record) {
    throw new BridgeError({
      code: "workspace_not_found",
      message: `Could not resolve workspace "${workspaceId}".`,
      status: 404,
    });
  }
  return record;
}
