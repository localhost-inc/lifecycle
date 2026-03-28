import type { SqlDriver, SqlStatement } from "@lifecycle/db";
import type { ServiceRecord } from "@lifecycle/contracts";
import { createSqlCollection, type SqlCollection } from "../collection";

interface ServiceRow {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  status_reason: string | null;
  assigned_port: number | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: ServiceRow): ServiceRecord {
  return {
    ...row,
    status: row.status as ServiceRecord["status"],
    status_reason: row.status_reason as ServiceRecord["status_reason"],
    // preview_url is derived client-side from the workspace preview route contract.
    preview_url: null,
  };
}

export async function selectServiceByWorkspaceAndName(
  driver: SqlDriver,
  workspaceId: string,
  name: string,
): Promise<ServiceRecord | undefined> {
  const rows = await driver.select<ServiceRow>(
    `SELECT id, workspace_id, name, status, status_reason, assigned_port, created_at, updated_at
     FROM service
     WHERE workspace_id = $1 AND name = $2
     LIMIT 1`,
    [workspaceId, name],
  );
  const row = rows[0];
  return row ? rowToRecord(row) : undefined;
}

export async function selectServicesByWorkspace(
  driver: SqlDriver,
  workspaceId: string,
): Promise<ServiceRecord[]> {
  const rows = await driver.select<ServiceRow>(
    `SELECT id, workspace_id, name, status, status_reason, assigned_port, created_at, updated_at
     FROM service WHERE workspace_id = $1 ORDER BY name`,
    [workspaceId],
  );
  return rows.map(rowToRecord);
}

export async function selectAllServices(driver: SqlDriver): Promise<ServiceRecord[]> {
  const rows = await driver.select<ServiceRow>(
    "SELECT id, workspace_id, name, status, status_reason, assigned_port, created_at, updated_at FROM service ORDER BY name",
  );
  return rows.map(rowToRecord);
}

function upsertServiceStatement(service: ServiceRecord): SqlStatement {
  return {
    sql: `INSERT INTO service (
           id, workspace_id, name, status, status_reason,
           assigned_port, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(workspace_id, name) DO UPDATE SET
           status = excluded.status,
           status_reason = excluded.status_reason,
           assigned_port = excluded.assigned_port,
           updated_at = excluded.updated_at`,
    params: [
      service.id,
      service.workspace_id,
      service.name,
      service.status,
      service.status_reason,
      service.assigned_port,
      service.created_at,
      service.updated_at,
    ],
  };
}

function deleteServiceStatement(serviceId: string): SqlStatement {
  return {
    sql: "DELETE FROM service WHERE id = $1",
    params: [serviceId],
  };
}

export function createServiceCollection(driver: SqlDriver): SqlCollection<ServiceRecord> {
  return createSqlCollection<ServiceRecord>({
    id: "services",
    driver,
    loadFn: selectAllServices,
    getKey: (service) => service.id,
    onInsert: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => upsertServiceStatement(mutation.modified)),
      );
    },
    onUpdate: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => upsertServiceStatement(mutation.modified)),
      );
    },
    onDelete: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => deleteServiceStatement(String(mutation.key))),
      );
    },
  });
}
