import type { SqlDriver } from "@lifecycle/db";
import type { ServiceRecord } from "@lifecycle/contracts";

export async function upsertService(driver: SqlDriver, service: ServiceRecord): Promise<void> {
  await driver.execute(
    `INSERT INTO service (
       id, workspace_id, name, status, status_reason,
       assigned_port, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(workspace_id, name) DO UPDATE SET
       status = excluded.status,
       status_reason = excluded.status_reason,
       assigned_port = excluded.assigned_port,
       updated_at = excluded.updated_at`,
    [
      service.id,
      service.workspace_id,
      service.name,
      service.status,
      service.status_reason,
      service.assigned_port,
      service.created_at,
      service.updated_at,
    ],
  );
}

export async function deleteService(driver: SqlDriver, serviceId: string): Promise<void> {
  await driver.execute("DELETE FROM service WHERE id = $1", [serviceId]);
}
