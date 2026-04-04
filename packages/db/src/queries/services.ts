import type { ServiceRecord, ServiceStatus, ServiceStatusReason } from "@lifecycle/contracts";
import type { SqlDriver, SqlStatement } from "../types";

export interface ServiceRow {
  id: string;
  workspace_id: string;
  name: string;
  status: ServiceStatus;
  status_reason: ServiceStatusReason | null;
  assigned_port: number | null;
  pid: number | null;
  created_at: string;
  updated_at: string;
}

const SERVICE_COLUMNS = `
  id, workspace_id, name, status, status_reason, assigned_port, pid, created_at, updated_at
`.trim();

export function serviceRecordFromRow(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    status: row.status,
    status_reason: row.status_reason,
    assigned_port: row.assigned_port,
    preview_url: row.assigned_port === null ? null : `http://localhost:${row.assigned_port}`,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listServiceRowsByWorkspace(
  db: SqlDriver,
  workspaceId: string,
): Promise<ServiceRow[]> {
  return db.select<ServiceRow>(
    `SELECT ${SERVICE_COLUMNS} FROM service WHERE workspace_id = $1 ORDER BY name COLLATE NOCASE`,
    [workspaceId],
  );
}

export async function listServiceRecordsByWorkspace(
  db: SqlDriver,
  workspaceId: string,
): Promise<ServiceRecord[]> {
  const rows = await listServiceRowsByWorkspace(db, workspaceId);
  return rows.map(serviceRecordFromRow);
}

export function upsertServiceStatement(service: ServiceRow): SqlStatement {
  return {
    sql: `INSERT INTO service (
            id, workspace_id, name, status, status_reason, assigned_port, pid, created_at, updated_at
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
         )
         ON CONFLICT(workspace_id, name) DO UPDATE SET
            status = excluded.status,
            status_reason = excluded.status_reason,
            assigned_port = excluded.assigned_port,
            pid = excluded.pid,
            updated_at = excluded.updated_at`,
    params: [
      service.id,
      service.workspace_id,
      service.name,
      service.status,
      service.status_reason,
      service.assigned_port,
      service.pid,
      service.created_at,
      service.updated_at,
    ],
  };
}

export async function upsertServiceRow(db: SqlDriver, service: ServiceRow): Promise<void> {
  const stmt = upsertServiceStatement(service);
  await db.execute(stmt.sql, stmt.params);
}
