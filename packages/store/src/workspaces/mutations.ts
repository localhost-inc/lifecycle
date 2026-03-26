import type { WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "../driver";

export async function createWorkspace(
  driver: SqlDriver,
  workspace: WorkspaceRecord,
  options?: {
    nameOrigin?: "manual" | "default";
    sourceRefOrigin?: "manual" | "default";
  },
): Promise<void> {
  await driver.execute(
    `INSERT INTO workspace (
        id, project_id, name, name_origin, source_ref, source_ref_origin,
        git_sha, worktree_path, host, checkout_type, manifest_fingerprint,
        prepared_at, status, failure_reason, failed_at,
        created_at, updated_at, last_active_at
     ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18
     )`,
    [
      workspace.id,
      workspace.project_id,
      workspace.name,
      options?.nameOrigin ?? "manual",
      workspace.source_ref,
      options?.sourceRefOrigin ?? "manual",
      workspace.git_sha,
      workspace.worktree_path,
      workspace.host,
      workspace.checkout_type,
      workspace.manifest_fingerprint ?? null,
      workspace.prepared_at ?? null,
      workspace.status,
      workspace.failure_reason,
      workspace.failed_at,
      workspace.created_at,
      workspace.updated_at,
      workspace.last_active_at,
    ],
  );
}

export async function updateWorkspace(
  driver: SqlDriver,
  workspace: WorkspaceRecord,
): Promise<void> {
  await driver.execute(
    `UPDATE workspace
     SET project_id = $2,
         name = $3,
         source_ref = $4,
         git_sha = $5,
         worktree_path = $6,
         host = $7,
         checkout_type = $8,
         manifest_fingerprint = $9,
         prepared_at = $10,
         status = $11,
         failure_reason = $12,
         failed_at = $13,
         updated_at = $14,
         last_active_at = $15
     WHERE id = $1`,
    [
      workspace.id,
      workspace.project_id,
      workspace.name,
      workspace.source_ref,
      workspace.git_sha,
      workspace.worktree_path,
      workspace.host,
      workspace.checkout_type,
      workspace.manifest_fingerprint ?? null,
      workspace.prepared_at ?? null,
      workspace.status,
      workspace.failure_reason,
      workspace.failed_at,
      workspace.updated_at,
      workspace.last_active_at,
    ],
  );
}

export async function deleteWorkspace(driver: SqlDriver, workspaceId: string): Promise<void> {
  await driver.execute("DELETE FROM workspace WHERE id = $1", [workspaceId]);
}
