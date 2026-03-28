import type { SqlDriver, SqlStatement } from "@lifecycle/db";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { createSqlCollection, type SqlCollection } from "../collection";

interface WorkspaceInsertMetadata {
  nameOrigin?: "manual" | "default";
  sourceRefOrigin?: "manual" | "default";
}

export async function selectAllWorkspaces(driver: SqlDriver): Promise<WorkspaceRecord[]> {
  return driver.select<WorkspaceRecord>(
    `SELECT id, project_id, name, checkout_type, source_ref, git_sha, worktree_path,
            host, manifest_fingerprint,
            created_at, updated_at, last_active_at, prepared_at,
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
            host, manifest_fingerprint,
            created_at, updated_at, last_active_at, prepared_at,
            status, failure_reason, failed_at
     FROM workspace WHERE id = $1`,
    [workspaceId],
  );
  return rows[0];
}

export async function selectWorkspacesByProject(
  driver: SqlDriver,
  projectId: string,
): Promise<WorkspaceRecord[]> {
  return driver.select<WorkspaceRecord>(
    `SELECT id, project_id, name, checkout_type, source_ref, git_sha, worktree_path,
            host, manifest_fingerprint,
            created_at, updated_at, last_active_at, prepared_at,
            status, failure_reason, failed_at
     FROM workspace
     WHERE project_id = $1
     ORDER BY last_active_at DESC`,
    [projectId],
  );
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

function insertWorkspaceStatement(
  workspace: WorkspaceRecord,
  options?: WorkspaceInsertMetadata,
): SqlStatement {
  return {
    sql: `INSERT INTO workspace (
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
    params: [
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
  };
}

function updateWorkspaceStatement(workspace: WorkspaceRecord): SqlStatement {
  return {
    sql: `UPDATE workspace
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
    params: [
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
  };
}

function deleteWorkspaceStatement(workspaceId: string): SqlStatement {
  return {
    sql: "DELETE FROM workspace WHERE id = $1",
    params: [workspaceId],
  };
}

export function createWorkspaceCollection(driver: SqlDriver): SqlCollection<WorkspaceRecord> {
  return createSqlCollection<WorkspaceRecord>({
    id: "workspaces",
    driver,
    loadFn: selectAllWorkspaces,
    getKey: (workspace) => workspace.id,
    onInsert: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) =>
          insertWorkspaceStatement(
            mutation.modified,
            (mutation.metadata ?? undefined) as WorkspaceInsertMetadata | undefined,
          ),
        ),
      );
    },
    onUpdate: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => updateWorkspaceStatement(mutation.modified)),
      );
    },
    onDelete: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => deleteWorkspaceStatement(String(mutation.key))),
      );
    },
  });
}
