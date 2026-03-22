import Database from "@tauri-apps/plugin-sql";
import type { SqlDriver } from "@lifecycle/store";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:lifecycle.db");
  }
  return db;
}

export const tauriSqlDriver: SqlDriver = {
  async select(sql, params) {
    const conn = await getDb();
    return conn.select(sql, params ?? []);
  },
  async execute(sql, params) {
    const conn = await getDb();
    const result = await conn.execute(sql, params ?? []);
    return { rowsAffected: result.rowsAffected };
  },
};
