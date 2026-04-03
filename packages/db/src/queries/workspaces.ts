import type { SqlDriver, SqlStatement } from "../types";

export interface WorkspaceRow {
  id: string;
  repository_id: string;
  name: string;
  checkout_type: string;
  source_ref: string;
  git_sha: string | null;
  worktree_path: string | null;
  host: string;
  manifest_fingerprint: string | null;
  prepared_at: string | null;
  status: string;
  failure_reason: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
}

const WORKSPACE_COLUMNS = `
  id, repository_id, name, checkout_type, source_ref, git_sha, worktree_path,
  host, manifest_fingerprint, prepared_at,
  status, failure_reason, failed_at,
  created_at, updated_at, last_active_at
`.trim();

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listWorkspacesByRepository(
  db: SqlDriver,
  repositoryId: string,
): Promise<WorkspaceRow[]> {
  return db.select<WorkspaceRow>(
    `SELECT ${WORKSPACE_COLUMNS} FROM workspace WHERE repository_id = $1 AND status != 'archived' ORDER BY name`,
    [repositoryId],
  );
}

export async function listAllWorkspaces(db: SqlDriver): Promise<WorkspaceRow[]> {
  return db.select<WorkspaceRow>(
    `SELECT ${WORKSPACE_COLUMNS} FROM workspace ORDER BY last_active_at DESC`,
  );
}

export async function getWorkspaceById(
  db: SqlDriver,
  workspaceId: string,
): Promise<WorkspaceRow | undefined> {
  const rows = await db.select<WorkspaceRow>(
    `SELECT ${WORKSPACE_COLUMNS} FROM workspace WHERE id = $1`,
    [workspaceId],
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Statements — pure SQL + params, no driver. Used by store collections
// for transaction batching and by the direct-execution functions below.
// ---------------------------------------------------------------------------

export interface WorkspaceInsertOptions {
  nameOrigin?: "manual" | "default";
  sourceRefOrigin?: "manual" | "default";
}

export function insertWorkspaceStatement(
  workspace: WorkspaceRow,
  options?: WorkspaceInsertOptions,
): SqlStatement {
  return {
    sql: `INSERT INTO workspace (
            id, repository_id, name, name_origin, source_ref, source_ref_origin,
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
      workspace.repository_id,
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

export function updateWorkspaceStatement(workspace: WorkspaceRow): SqlStatement {
  return {
    sql: `UPDATE workspace
         SET repository_id = $2,
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
      workspace.repository_id,
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

export function deleteWorkspaceStatement(workspaceId: string): SqlStatement {
  return {
    sql: "DELETE FROM workspace WHERE id = $1",
    params: [workspaceId],
  };
}

// ---------------------------------------------------------------------------
// Direct execution — convenience wrappers for CLI use
// ---------------------------------------------------------------------------

export async function insertWorkspace(
  db: SqlDriver,
  input: {
    repositoryId: string;
    name: string;
    sourceRef: string;
    worktreePath?: string | null;
    host?: string;
    checkoutType?: "root" | "worktree";
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stmt = insertWorkspaceStatement({
    id,
    repository_id: input.repositoryId,
    name: input.name,
    checkout_type: input.checkoutType ?? "worktree",
    source_ref: input.sourceRef,
    git_sha: null,
    worktree_path: input.worktreePath ?? null,
    host: input.host ?? "local",
    manifest_fingerprint: null,
    prepared_at: null,
    status: "active",
    failure_reason: null,
    failed_at: null,
    created_at: now,
    updated_at: now,
    last_active_at: now,
  });
  await db.execute(stmt.sql, stmt.params);
  return id;
}

export async function archiveWorkspace(
  db: SqlDriver,
  repositoryId: string,
  workspaceName: string,
): Promise<boolean> {
  const result = await db.execute(
    "UPDATE workspace SET status = 'archived', updated_at = datetime('now') WHERE repository_id = $1 AND name = $2 AND status != 'archived'",
    [repositoryId, workspaceName],
  );
  return result.rowsAffected > 0;
}

// ---------------------------------------------------------------------------
// Composite query — repos with their active workspaces
// ---------------------------------------------------------------------------

export interface RepositoryWithWorkspaces {
  id: string;
  path: string;
  name: string;
  workspaces: WorkspaceRow[];
}

export async function listRepositoriesWithWorkspaces(
  db: SqlDriver,
): Promise<RepositoryWithWorkspaces[]> {
  const repos = await db.select<{ id: string; path: string; name: string }>(
    "SELECT id, path, name FROM repository ORDER BY name COLLATE NOCASE",
  );

  const result: RepositoryWithWorkspaces[] = [];
  for (const repo of repos) {
    const workspaces = await db.select<WorkspaceRow>(
      `SELECT ${WORKSPACE_COLUMNS} FROM workspace WHERE repository_id = $1 AND status != 'archived' ORDER BY name`,
      [repo.id],
    );

    result.push({ ...repo, workspaces });
  }

  return result;
}
