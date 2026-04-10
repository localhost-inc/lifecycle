import type {
  WorkspaceCheckoutType,
  WorkspaceFailureReason,
  WorkspaceHost,
  WorkspaceRecord,
  WorkspaceStatus,
} from "@lifecycle/contracts";
import { slugWithSuffix, slugifyName } from "@lifecycle/contracts";
import type { SqlDriver, SqlStatement } from "../types";

export interface WorkspaceRow {
  id: string;
  repository_id: string;
  name: string;
  slug: string;
  checkout_type: WorkspaceCheckoutType;
  source_ref: string;
  git_sha: string | null;
  workspace_root: string | null;
  host: WorkspaceHost;
  manifest_fingerprint: string | null;
  prepared_at: string | null;
  status: WorkspaceStatus;
  failure_reason: WorkspaceFailureReason | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
}

export function workspaceRecordFromRow(row: WorkspaceRow): WorkspaceRecord {
  return row;
}

const WORKSPACE_COLUMNS = `
  id, repository_id, name, slug, checkout_type, source_ref, git_sha, workspace_root,
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

export async function getWorkspaceRecordById(
  db: SqlDriver,
  workspaceId: string,
): Promise<WorkspaceRecord | undefined> {
  const row = await getWorkspaceById(db, workspaceId);
  return row ? workspaceRecordFromRow(row) : undefined;
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
  workspace: WorkspaceRecord,
  options?: WorkspaceInsertOptions,
): SqlStatement {
  return {
    sql: `INSERT INTO workspace (
            id, repository_id, name, slug, name_origin, source_ref, source_ref_origin,
            git_sha, workspace_root, host, checkout_type, manifest_fingerprint,
            prepared_at, status, failure_reason, failed_at,
            created_at, updated_at, last_active_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18, $19
         )`,
    params: [
      workspace.id,
      workspace.repository_id,
      workspace.name,
      workspace.slug,
      options?.nameOrigin ?? "manual",
      workspace.source_ref,
      options?.sourceRefOrigin ?? "manual",
      workspace.git_sha,
      workspace.workspace_root,
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
             slug = $4,
             source_ref = $5,
             git_sha = $6,
             workspace_root = $7,
             host = $8,
             checkout_type = $9,
             manifest_fingerprint = $10,
             prepared_at = $11,
             status = $12,
             failure_reason = $13,
             failed_at = $14,
             updated_at = $15,
             last_active_at = $16
         WHERE id = $1`,
    params: [
      workspace.id,
      workspace.repository_id,
      workspace.name,
      workspace.slug,
      workspace.source_ref,
      workspace.git_sha,
      workspace.workspace_root,
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
    workspaceRoot?: string | null;
    host?: WorkspaceHost;
    checkoutType?: WorkspaceCheckoutType;
    preparedAt?: string | null;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = await resolveUniqueWorkspaceSlug(db, input.repositoryId, input.name);
  const stmt = insertWorkspaceStatement({
    id,
    repository_id: input.repositoryId,
    name: input.name,
    slug,
    checkout_type: input.checkoutType ?? "worktree",
    source_ref: input.sourceRef,
    git_sha: null,
    workspace_root: input.workspaceRoot ?? null,
    host: input.host ?? "local",
    manifest_fingerprint: null,
    prepared_at: input.preparedAt ?? null,
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

export async function markWorkspacePrepared(
  db: SqlDriver,
  workspaceId: string,
  preparedAt: string,
): Promise<void> {
  await db.execute(
    "UPDATE workspace SET prepared_at = $2, updated_at = $3 WHERE id = $1",
    [workspaceId, preparedAt, preparedAt],
  );
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
  slug: string;
  workspaces: WorkspaceRow[];
}

export async function listRepositoriesWithWorkspaces(
  db: SqlDriver,
): Promise<RepositoryWithWorkspaces[]> {
  const repos = await db.select<{ id: string; path: string; name: string; slug: string }>(
    "SELECT id, path, name, slug FROM repository ORDER BY name COLLATE NOCASE",
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

export async function resolveUniqueWorkspaceSlug(
  db: SqlDriver,
  repositoryId: string,
  name: string,
): Promise<string> {
  const baseSlug = slugifyName(name, "workspace");
  const matches = await db.select<{ slug: string }>(
    "SELECT slug FROM workspace WHERE repository_id = $1 AND (slug = $2 OR slug LIKE $3)",
    [repositoryId, baseSlug, `${baseSlug}-%`],
  );
  const existing = new Set(matches.map((row) => row.slug));

  let index = 1;
  while (true) {
    const candidate = slugWithSuffix(baseSlug, index);
    if (!existing.has(candidate)) {
      return candidate;
    }
    index += 1;
  }
}
