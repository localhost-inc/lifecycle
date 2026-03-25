import type { PlanRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "../driver";

export async function selectPlansByProject(
  driver: SqlDriver,
  projectId: string,
): Promise<PlanRecord[]> {
  return driver.select<PlanRecord>(
    `SELECT id, project_id, workspace_id, name, description, body, status, position,
            created_at, updated_at
     FROM plan WHERE project_id = $1 ORDER BY position`,
    [projectId],
  );
}

export async function selectPlanById(
  driver: SqlDriver,
  planId: string,
): Promise<PlanRecord | undefined> {
  const rows = await driver.select<PlanRecord>(
    `SELECT id, project_id, workspace_id, name, description, body, status, position,
            created_at, updated_at
     FROM plan WHERE id = $1`,
    [planId],
  );
  return rows[0];
}
