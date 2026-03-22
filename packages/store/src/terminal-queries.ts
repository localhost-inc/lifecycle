import type { TerminalRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "./driver";

export async function selectTerminalsByWorkspace(
  driver: SqlDriver,
  workspaceId: string,
): Promise<TerminalRecord[]> {
  return driver.select<TerminalRecord>(
    `SELECT id, workspace_id, launch_type, harness_provider, harness_session_id,
            created_by, label, status, failure_reason, exit_code,
            started_at, last_active_at, ended_at
     FROM terminal WHERE workspace_id = $1
     ORDER BY last_active_at DESC`,
    [workspaceId],
  );
}

export async function selectAllTerminals(driver: SqlDriver): Promise<TerminalRecord[]> {
  return driver.select<TerminalRecord>(
    `SELECT id, workspace_id, launch_type, harness_provider, harness_session_id,
            created_by, label, status, failure_reason, exit_code,
            started_at, last_active_at, ended_at
     FROM terminal
     ORDER BY last_active_at DESC`,
  );
}

export async function updateTerminalLabel(
  driver: SqlDriver,
  terminalId: string,
  label: string,
): Promise<void> {
  await driver.execute(
    "UPDATE terminal SET label = $1, label_origin = 'manual', last_active_at = datetime('now') WHERE id = $2",
    [label, terminalId],
  );
}
