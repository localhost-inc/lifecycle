import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlDriver } from "./types";

export interface DbMigration {
  description: string;
  fileName: string;
  version: number;
}

const DB_MIGRATIONS: DbMigration[] = [
  {
    version: 1,
    description: "init",
    fileName: "0001_init.sql",
  },
  {
    version: 2,
    description: "rename worktree_path to workspace_root",
    fileName: "0002_rename_worktree_path.sql",
  },
  {
    version: 3,
    description: "add repository and workspace slug columns",
    fileName: "0003_add_slugs.sql",
  },
  {
    version: 4,
    description: "rename legacy agent schema to agent",
    fileName: "0004_rename_agent_session.sql",
  },
  {
    version: 5,
    description: "drop legacy service table",
    fileName: "0005_drop_service.sql",
  },
];

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

interface MigrationRow {
  version: number;
}

interface SqliteObjectRow {
  name: string;
}

export function getDbMigrations(): DbMigration[] {
  return DB_MIGRATIONS.slice();
}

export async function readDbMigrationSql(fileName: string): Promise<string> {
  const migration = DB_MIGRATIONS.find((entry) => entry.fileName === fileName);
  if (!migration) {
    throw new Error(`Unknown database migration file: ${fileName}`);
  }
  return readFile(join(migrationsDir, migration.fileName), "utf8");
}

async function ensureMigrationTable(driver: SqlDriver): Promise<void> {
  await driver.execute(
    `CREATE TABLE IF NOT EXISTS lifecycle_migration (
       version INTEGER PRIMARY KEY NOT NULL,
       description TEXT NOT NULL,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
}

async function selectAppliedVersions(driver: SqlDriver): Promise<Set<number>> {
  const rows = await driver.select<MigrationRow>(
    `SELECT version
       FROM lifecycle_migration
      ORDER BY version ASC`,
  );
  return new Set(rows.map((row) => row.version));
}

async function tableExists(driver: SqlDriver, tableName: string): Promise<boolean> {
  const rows = await driver.select<SqliteObjectRow>(
    `SELECT name
       FROM sqlite_master
      WHERE type = 'table' AND name = $1`,
    [tableName],
  );
  return rows.length > 0;
}

export async function applyDbMigrations(driver: SqlDriver): Promise<void> {
  await ensureMigrationTable(driver);
  const appliedVersions = await selectAppliedVersions(driver);

  for (const migration of DB_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    if (migration.version === 4) {
      const hasLegacyAgentTable = await tableExists(driver, "agent_session");
      if (!hasLegacyAgentTable) {
        const hasAgentTable = await tableExists(driver, "agent");
        if (!hasAgentTable) {
          throw new Error(
            "Database is missing both legacy agent_session and current agent tables.",
          );
        }

        await driver.execute(
          `INSERT INTO lifecycle_migration (version, description)
            VALUES ($1, $2)`,
          [migration.version, migration.description],
        );
        appliedVersions.add(migration.version);
        continue;
      }
    }

    const sql = await readDbMigrationSql(migration.fileName);
    await driver.transaction([
      { sql },
      {
        sql: `INSERT INTO lifecycle_migration (version, description)
              VALUES ($1, $2)`,
        params: [migration.version, migration.description],
      },
    ]);
    appliedVersions.add(migration.version);
  }
}
