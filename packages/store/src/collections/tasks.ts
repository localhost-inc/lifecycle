import type { TaskDependencyRecord, TaskRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "../driver";

export async function selectTasksByProject(
  driver: SqlDriver,
  projectId: string,
): Promise<TaskRecord[]> {
  return driver.select<TaskRecord>(
    `SELECT id, plan_id, project_id, workspace_id, agent_session_id,
            name, description, status, priority, position,
            completed_at, created_at, updated_at
     FROM task WHERE project_id = $1 ORDER BY position`,
    [projectId],
  );
}

export async function selectTasksByPlan(driver: SqlDriver, planId: string): Promise<TaskRecord[]> {
  return driver.select<TaskRecord>(
    `SELECT id, plan_id, project_id, workspace_id, agent_session_id,
            name, description, status, priority, position,
            completed_at, created_at, updated_at
     FROM task WHERE plan_id = $1 ORDER BY position`,
    [planId],
  );
}

export async function selectTaskDependencies(
  driver: SqlDriver,
  taskId: string,
): Promise<TaskDependencyRecord[]> {
  return driver.select<TaskDependencyRecord>(
    `SELECT task_id, depends_on_task_id, created_at
     FROM task_dependency WHERE task_id = $1`,
    [taskId],
  );
}

export async function selectReadyTasks(
  driver: SqlDriver,
  projectId: string,
): Promise<TaskRecord[]> {
  return driver.select<TaskRecord>(
    `SELECT t.id, t.plan_id, t.project_id, t.workspace_id, t.agent_session_id,
            t.name, t.description, t.status, t.priority, t.position,
            t.completed_at, t.created_at, t.updated_at
     FROM task t
     WHERE t.project_id = $1
       AND t.status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM task_dependency td
         JOIN task dep ON dep.id = td.depends_on_task_id
         WHERE td.task_id = t.id AND dep.status != 'completed'
       )
     ORDER BY t.priority DESC, t.position`,
    [projectId],
  );
}
