import type { WorkspaceRecord } from "@lifecycle/contracts";
import { createSqlCollection, type SqlCollection } from "../collection";
import type { SqlDriver } from "../driver";
import { createWorkspace, deleteWorkspace, updateWorkspace } from "../workspaces/mutations";

interface WorkspaceInsertMetadata {
  nameOrigin?: "manual" | "default";
  sourceRefOrigin?: "manual" | "default";
}

export async function selectAllWorkspaces(driver: SqlDriver): Promise<WorkspaceRecord[]> {
  return driver.select<WorkspaceRecord>(
    `SELECT id, project_id, name, checkout_type, source_ref, git_sha, worktree_path,
            host, manifest_fingerprint,
            created_at, updated_at, last_active_at, prepared_at,
            status, failure_reason, failed_at
     FROM workspace
     ORDER BY last_active_at DESC`,
  );
}

export async function selectWorkspaceById(
  driver: SqlDriver,
  workspaceId: string,
): Promise<WorkspaceRecord | undefined> {
  const rows = await driver.select<WorkspaceRecord>(
    `SELECT id, project_id, name, checkout_type, source_ref, git_sha, worktree_path,
            host, manifest_fingerprint,
            created_at, updated_at, last_active_at, prepared_at,
            status, failure_reason, failed_at
     FROM workspace WHERE id = $1`,
    [workspaceId],
  );
  return rows[0];
}

export function groupWorkspacesByProject(
  workspaces: WorkspaceRecord[],
): Record<string, WorkspaceRecord[]> {
  const groups: Record<string, WorkspaceRecord[]> = {};
  for (const ws of workspaces) {
    (groups[ws.project_id] ??= []).push(ws);
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => {
      if (a.checkout_type === "root" && b.checkout_type !== "root") return -1;
      if (b.checkout_type === "root" && a.checkout_type !== "root") return 1;
      return b.last_active_at.localeCompare(a.last_active_at);
    });
  }
  return groups;
}

export function createWorkspaceCollection(driver: SqlDriver): SqlCollection<WorkspaceRecord> {
  return createSqlCollection<WorkspaceRecord>({
    id: "workspaces",
    driver,
    loadFn: selectAllWorkspaces,
    getKey: (workspace) => workspace.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          createWorkspace(
            driver,
            mutation.modified,
            (mutation.metadata ?? undefined) as WorkspaceInsertMetadata | undefined,
          ),
        ),
      );
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) => updateWorkspace(driver, mutation.modified)),
      );
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) => deleteWorkspace(driver, String(mutation.key))),
      );
    },
  });
}
