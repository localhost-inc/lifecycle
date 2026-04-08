import type { SqlDriver } from "@lifecycle/db";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import {
  listAllWorkspaces as listAllWorkspaceRows,
  getWorkspaceById as getWorkspaceByIdRow,
  listWorkspacesByRepository as listWorkspacesByRepoRows,
  insertWorkspaceStatement,
  updateWorkspaceStatement,
  deleteWorkspaceStatement,
  type WorkspaceInsertOptions,
} from "@lifecycle/db/queries";
import { createSqlCollection, type SqlCollection } from "../collection";

export async function selectAllWorkspaces(driver: SqlDriver): Promise<WorkspaceRecord[]> {
  return listAllWorkspaceRows(driver) as Promise<WorkspaceRecord[]>;
}

export async function selectWorkspaceById(
  driver: SqlDriver,
  workspaceId: string,
): Promise<WorkspaceRecord | undefined> {
  return getWorkspaceByIdRow(driver, workspaceId) as Promise<WorkspaceRecord | undefined>;
}

export async function selectWorkspacesByRepository(
  driver: SqlDriver,
  repositoryId: string,
): Promise<WorkspaceRecord[]> {
  return listWorkspacesByRepoRows(driver, repositoryId) as Promise<WorkspaceRecord[]>;
}

export function groupWorkspacesByRepository(
  workspaces: WorkspaceRecord[],
): Record<string, WorkspaceRecord[]> {
  const groups: Record<string, WorkspaceRecord[]> = {};
  for (const ws of workspaces) {
    (groups[ws.repository_id] ??= []).push(ws);
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
      await driver.transaction(
        transaction.mutations.map((mutation) =>
          insertWorkspaceStatement(
            mutation.modified as any,
            (mutation.metadata ?? undefined) as WorkspaceInsertOptions | undefined,
          ),
        ),
      );
    },
    onUpdate: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => updateWorkspaceStatement(mutation.modified as any)),
      );
    },
    onDelete: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => deleteWorkspaceStatement(String(mutation.key))),
      );
    },
  });
}
