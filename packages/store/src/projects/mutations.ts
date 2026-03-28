import type { SqlDriver } from "@lifecycle/db";
import type { ProjectRecord } from "@lifecycle/contracts";

export async function createProject(driver: SqlDriver, project: ProjectRecord): Promise<void> {
  await driver.execute(
    `INSERT INTO project (
        id, path, name, manifest_path, manifest_valid, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      project.id,
      project.path,
      project.name,
      project.manifestPath,
      project.manifestValid ? 1 : 0,
      project.createdAt,
      project.updatedAt,
    ],
  );
}

export async function updateProject(driver: SqlDriver, project: ProjectRecord): Promise<void> {
  await driver.execute(
    `UPDATE project
     SET path = $2,
         name = $3,
         manifest_path = $4,
         manifest_valid = $5,
         updated_at = $6
     WHERE id = $1`,
    [
      project.id,
      project.path,
      project.name,
      project.manifestPath,
      project.manifestValid ? 1 : 0,
      project.updatedAt,
    ],
  );
}

export async function deleteProject(driver: SqlDriver, projectId: string): Promise<void> {
  await driver.execute("DELETE FROM project WHERE id = $1", [projectId]);
}
