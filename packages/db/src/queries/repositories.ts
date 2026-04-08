import { slugWithSuffix, slugifyName } from "@lifecycle/contracts";
import type { SqlDriver, SqlStatement } from "../types";

export interface RepositoryRow {
  id: string;
  path: string;
  name: string;
  slug: string;
  manifest_path: string;
  manifest_valid: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listRepositories(db: SqlDriver): Promise<RepositoryRow[]> {
  return db.select<RepositoryRow>(
    "SELECT id, path, name, slug, manifest_path, manifest_valid, created_at, updated_at FROM repository ORDER BY name COLLATE NOCASE",
  );
}

export async function getRepositoryById(
  db: SqlDriver,
  repositoryId: string,
): Promise<RepositoryRow | undefined> {
  const rows = await db.select<RepositoryRow>(
    "SELECT id, path, name, slug, manifest_path, manifest_valid, created_at, updated_at FROM repository WHERE id = $1 LIMIT 1",
    [repositoryId],
  );
  return rows[0];
}

export async function getRepositoryByPath(
  db: SqlDriver,
  absolutePath: string,
): Promise<RepositoryRow | undefined> {
  const rows = await db.select<RepositoryRow>(
    "SELECT id, path, name, slug, manifest_path, manifest_valid, created_at, updated_at FROM repository WHERE path = $1 LIMIT 1",
    [absolutePath],
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export function insertRepositoryStatement(repository: RepositoryRow): SqlStatement {
  return {
    sql: `INSERT INTO repository (
            id, path, name, slug, manifest_path, manifest_valid, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    params: [
      repository.id,
      repository.path,
      repository.name,
      repository.slug,
      repository.manifest_path,
      repository.manifest_valid,
      repository.created_at,
      repository.updated_at,
    ],
  };
}

export function updateRepositoryStatement(repository: RepositoryRow): SqlStatement {
  return {
    sql: `UPDATE repository
         SET path = $2,
             name = $3,
             slug = $4,
             manifest_path = $5,
             manifest_valid = $6,
             updated_at = $7
         WHERE id = $1`,
    params: [
      repository.id,
      repository.path,
      repository.name,
      repository.slug,
      repository.manifest_path,
      repository.manifest_valid,
      repository.updated_at,
    ],
  };
}

export function deleteRepositoryStatement(repositoryId: string): SqlStatement {
  return {
    sql: "DELETE FROM repository WHERE id = $1",
    params: [repositoryId],
  };
}

// ---------------------------------------------------------------------------
// Direct execution
// ---------------------------------------------------------------------------

export async function insertRepository(
  db: SqlDriver,
  input: { path: string; name: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = await resolveUniqueRepositorySlug(db, input.name);
  const stmt = insertRepositoryStatement({
    id,
    path: input.path,
    name: input.name,
    slug,
    manifest_path: "lifecycle.json",
    manifest_valid: 0,
    created_at: now,
    updated_at: now,
  });
  await db.execute(stmt.sql, stmt.params);
  return id;
}

async function resolveUniqueRepositorySlug(db: SqlDriver, name: string): Promise<string> {
  const baseSlug = slugifyName(name, "repository");
  const matches = await db.select<{ slug: string }>(
    "SELECT slug FROM repository WHERE slug = $1 OR slug LIKE $2",
    [baseSlug, `${baseSlug}-%`],
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

export async function deleteRepository(db: SqlDriver, repositoryId: string): Promise<boolean> {
  const stmt = deleteRepositoryStatement(repositoryId);
  const result = await db.execute(stmt.sql, stmt.params);
  return result.rowsAffected > 0;
}
