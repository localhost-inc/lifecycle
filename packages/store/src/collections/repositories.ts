import type { SqlDriver } from "@lifecycle/db";
import type { RepositoryRecord } from "@lifecycle/contracts";
import {
  listRepositories as listRepositoryRows,
  getRepositoryById as getRepositoryByIdRow,
  insertRepositoryStatement,
  updateRepositoryStatement,
  deleteRepositoryStatement,
  type RepositoryRow,
} from "@lifecycle/db/queries";
import { createSqlCollection, type SqlCollection } from "../collection";

function rowToRecord(row: RepositoryRow): RepositoryRecord {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    manifestPath: row.manifest_path,
    manifestValid: row.manifest_valid === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordToRow(record: RepositoryRecord): RepositoryRow {
  return {
    id: record.id,
    path: record.path,
    name: record.name,
    manifest_path: record.manifestPath,
    manifest_valid: record.manifestValid ? 1 : 0,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export async function selectAllRepositories(driver: SqlDriver): Promise<RepositoryRecord[]> {
  const rows = await listRepositoryRows(driver);
  return rows.map(rowToRecord);
}

export async function selectRepositoryById(
  driver: SqlDriver,
  repositoryId: string,
): Promise<RepositoryRecord | undefined> {
  const row = await getRepositoryByIdRow(driver, repositoryId);
  return row ? rowToRecord(row) : undefined;
}

export function createRepositoryCollection(driver: SqlDriver): SqlCollection<RepositoryRecord> {
  return createSqlCollection<RepositoryRecord>({
    id: "repositories",
    driver,
    loadFn: selectAllRepositories,
    getKey: (repository) => repository.id,
    onInsert: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) =>
          insertRepositoryStatement(recordToRow(mutation.modified)),
        ),
      );
    },
    onUpdate: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) =>
          updateRepositoryStatement(recordToRow(mutation.modified)),
        ),
      );
    },
    onDelete: async ({ transaction }) => {
      await driver.transaction(
        transaction.mutations.map((mutation) => deleteRepositoryStatement(String(mutation.key))),
      );
    },
  });
}
