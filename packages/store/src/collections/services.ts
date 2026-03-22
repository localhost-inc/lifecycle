import type { ServiceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "../driver";

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
    // preview_url is computed by Rust's preview proxy system (hostname-based routing).
    // The StoreProvider enriches records after hydration via a Rust command.
    preview_url: null,
  };
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
