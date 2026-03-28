import type { SqlDriver, SqlStatement } from "@lifecycle/db";
import type { ProjectRecord } from "@lifecycle/contracts";
import { createSqlCollection, type SqlCollection } from "../collection";

interface ProjectRow {
  id: string;
  path: string;
  name: string;
  manifest_path: string;
  manifest_valid: number;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    manifestPath: row.manifest_path,
    manifestValid: row.manifest_valid === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function selectAllProjects(driver: SqlDriver): Promise<ProjectRecord[]> {
  const rows = await driver.select<ProjectRow>(
    "SELECT id, path, name, manifest_path, manifest_valid, created_at, updated_at FROM project ORDER BY name COLLATE NOCASE",
  );
  return rows.map(rowToRecord);
}

export async function selectProjectById(
  driver: SqlDriver,
  projectId: string,
): Promise<ProjectRecord | undefined> {
  const rows = await driver.select<ProjectRow>(
    "SELECT id, path, name, manifest_path, manifest_valid, created_at, updated_at FROM project WHERE id = $1 LIMIT 1",
    [projectId],
  );
  return rows[0] ? rowToRecord(rows[0]) : undefined;
}

function insertProjectStatement(project: ProjectRecord): SqlStatement {
  return {
    sql: `INSERT INTO project (
            id, path, name, manifest_path, manifest_valid, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    params: [
      project.id,
      project.path,
      project.name,
      project.manifestPath,
      project.manifestValid ? 1 : 0,
      project.createdAt,
      project.updatedAt,
    ],
  };
}

function updateProjectStatement(project: ProjectRecord): SqlStatement {
  return {
    sql: `UPDATE project
         SET path = $2,
             name = $3,
             manifest_path = $4,
             manifest_valid = $5,
             updated_at = $6
         WHERE id = $1`,
    params: [
      project.id,
      project.path,
      project.name,
      project.manifestPath,
      project.manifestValid ? 1 : 0,
      project.updatedAt,
    ],
  };
}

function deleteProjectStatement(projectId: string): SqlStatement {
  return {
    sql: "DELETE FROM project WHERE id = $1",
    params: [projectId],
  };
}

export function createProjectCollection(driver: SqlDriver): SqlCollection<ProjectRecord> {
  return createSqlCollection<ProjectRecord>({
    id: "projects",
    driver,
    loadFn: selectAllProjects,
    getKey: (project) => project.id,
    onInsert: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => insertProjectStatement(mutation.modified)),
      );
    },
    onUpdate: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => updateProjectStatement(mutation.modified)),
      );
    },
    onDelete: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => deleteProjectStatement(String(mutation.key))),
      );
    },
  });
}
