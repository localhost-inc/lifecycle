import type { SqlDriver } from "./types";

export interface LocalDb extends SqlDriver {
  readonly mode: "local";
}

export function createLocalDb(driver: SqlDriver): LocalDb {
  return {
    mode: "local",
    select: (sql, params) => driver.select(sql, params),
    execute: (sql, params) => driver.execute(sql, params),
    transaction: (statements) => driver.transaction(statements),
  };
}
