import { connect } from "@tursodatabase/sync";
import type { DatabaseOpts, DatabaseStats } from "@tursodatabase/sync-common";
import type { SqlDriver, SqlStatement, SqlTransactionResult } from "./types";

interface TursoDbBase extends SqlDriver {
  close(): Promise<void>;
}

export interface TursoLocalDb extends TursoDbBase {
  readonly mode: "local";
}

export interface TursoSyncedDb extends TursoDbBase {
  readonly mode: "synced";
  pull(): Promise<boolean>;
  push(): Promise<void>;
  checkpoint(): Promise<void>;
  stats(): Promise<DatabaseStats>;
}

export type TursoDb = TursoLocalDb | TursoSyncedDb;
export type TursoDbConfig = DatabaseOpts;
export type TursoSyncStats = DatabaseStats;

function normalizeStatementParams(
  sql: string,
  params: readonly unknown[] | undefined,
): { params: unknown[]; sql: string } {
  if (!params || params.length === 0) {
    return { sql, params: [] };
  }

  const orderedParams: unknown[] = [];
  const nextSql = sql.replace(/\$(\d+)\b/g, (_match, index) => {
    orderedParams.push(params[Number(index) - 1]);
    return "?";
  });

  return {
    sql: nextSql,
    params: orderedParams.length > 0 ? orderedParams : [...params],
  };
}

export async function createTursoDb(config: TursoDbConfig): Promise<TursoDb> {
  const database = await connect(config);

  async function executeStatement(statement: SqlStatement): Promise<{ rowsAffected: number }> {
    const normalized = normalizeStatementParams(statement.sql, statement.params);
    if (normalized.params.length === 0) {
      await database.exec(statement.sql);
      return { rowsAffected: 0 };
    }

    const preparedStatement = database.prepare(normalized.sql);
    const result = await preparedStatement.run(...normalized.params);
    return { rowsAffected: result.changes };
  }

  const driver = {
    async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const normalized = normalizeStatementParams(sql, params);
      const statement = database.prepare(normalized.sql);
      return (await statement.all(...normalized.params)) as T[];
    },
    async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
      return executeStatement({ sql, ...(params ? { params } : {}) });
    },
    async transaction(statements: readonly SqlStatement[]): Promise<SqlTransactionResult> {
      const rowsAffected: number[] = [];
      await database.exec("BEGIN IMMEDIATE");
      try {
        for (const statement of statements) {
          const result = await executeStatement(statement);
          rowsAffected.push(result.rowsAffected);
        }
        await database.exec("COMMIT");
        return { rowsAffected };
      } catch (error) {
        try {
          await database.exec("ROLLBACK");
        } catch {
          // Preserve the original failure.
        }
        throw error;
      }
    },
    close: () => database.close(),
  } satisfies TursoDbBase;

  if (config.url === undefined) {
    return {
      mode: "local",
      ...driver,
    };
  }

  return {
    mode: "synced",
    ...driver,
    pull: () => database.pull(),
    push: () => database.push(),
    checkpoint: () => database.checkpoint(),
    stats: () => database.stats(),
  };
}
