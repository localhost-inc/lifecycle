import type { ProjectRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "./driver";

interface ProjectRow {
  id: string;
  path: string;
  name: string;
  manifest_path: string;
  manifest_valid: number;
  organization_id: string | null;
  repository_id: string | null;
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
    ...(row.organization_id != null ? { organizationId: row.organization_id } : {}),
    ...(row.repository_id != null ? { repositoryId: row.repository_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function selectAllProjects(driver: SqlDriver): Promise<ProjectRecord[]> {
  const rows = await driver.select<ProjectRow>(
    "SELECT id, path, name, manifest_path, manifest_valid, organization_id, repository_id, created_at, updated_at FROM project ORDER BY name COLLATE NOCASE",
  );
  return rows.map(rowToRecord);
}

export async function insertProject(
  driver: SqlDriver,
  project: { id: string; path: string; name: string; manifestPath?: string },
): Promise<void> {
  await driver.execute(
    "INSERT INTO project (id, path, name, manifest_path) VALUES ($1, $2, $3, $4)",
    [project.id, project.path, project.name, project.manifestPath ?? "lifecycle.json"],
  );
}

export async function deleteProject(driver: SqlDriver, projectId: string): Promise<void> {
  await driver.execute("DELETE FROM project WHERE id = $1", [projectId]);
}

export async function updateProjectManifestStatus(
  driver: SqlDriver,
  projectId: string,
  valid: boolean,
): Promise<void> {
  await driver.execute(
    "UPDATE project SET manifest_valid = $1, updated_at = datetime('now') WHERE id = $2",
    [valid ? 1 : 0, projectId],
  );
}
