import type { ProjectRecord } from "@lifecycle/contracts";
import { createSqlCollection, type SqlCollection } from "../collection";
import type { SqlDriver } from "../driver";
import { createProject, deleteProject, updateProject } from "../projects/mutations";

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

export function createProjectCollection(driver: SqlDriver): SqlCollection<ProjectRecord> {
  return createSqlCollection<ProjectRecord>({
    id: "projects",
    driver,
    loadFn: selectAllProjects,
    getKey: (project) => project.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) => createProject(driver, mutation.modified)),
      );
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) => updateProject(driver, mutation.modified)),
      );
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) => deleteProject(driver, String(mutation.key))),
      );
    },
  });
}
