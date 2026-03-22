import type { WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "./driver";

export async function selectAllWorkspaces(driver: SqlDriver): Promise<WorkspaceRecord[]> {
  return driver.select<WorkspaceRecord>(
    `SELECT id, project_id, name, checkout_type, source_ref, git_sha, worktree_path,
            target, manifest_fingerprint, created_by, source_workspace_id,
            created_at, updated_at, last_active_at, expires_at, prepared_at,
            status, failure_reason, failed_at
     FROM workspace
     ORDER BY last_active_at DESC`,
  );
}

export async function selectWorkspaceById(
  driver: SqlDriver,
  workspaceId: string,
): Promise<WorkspaceRecord | undefined> {
  const rows = await driver.select<WorkspaceRecord>(
    `SELECT id, project_id, name, checkout_type, source_ref, git_sha, worktree_path,
            target, manifest_fingerprint, created_by, source_workspace_id,
            created_at, updated_at, last_active_at, expires_at, prepared_at,
            status, failure_reason, failed_at
     FROM workspace WHERE id = $1`,
    [workspaceId],
  );
  return rows[0];
}

export function groupWorkspacesByProject(
  workspaces: WorkspaceRecord[],
): Record<string, WorkspaceRecord[]> {
  const groups: Record<string, WorkspaceRecord[]> = {};
  for (const ws of workspaces) {
    (groups[ws.project_id] ??= []).push(ws);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => {
      if (a.checkout_type === "root" && b.checkout_type !== "root") return -1;
      if (b.checkout_type === "root" && a.checkout_type !== "root") return 1;
      return b.last_active_at.localeCompare(a.last_active_at);
    });
  }
  return groups;
}
