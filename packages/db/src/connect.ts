import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { createTursoDb, type TursoDb } from "./turso";
import { applyDbMigrations } from "./migrations";

const DB_DIR = join(homedir(), ".lifecycle");
const DB_PATH = join(DB_DIR, "lifecycle.db");

let cached: TursoDb | null = null;

export async function getLifecycleDb(): Promise<TursoDb> {
  if (cached) return cached;

  mkdirSync(DB_DIR, { recursive: true });
  const db = await createTursoDb({ path: DB_PATH });
  await applyDbMigrations(db);
  cached = db;
  return db;
}
