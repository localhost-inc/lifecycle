import { mkdirSync } from "node:fs";
import { createTursoDb, type TursoDb } from "./turso";
import { applyDbMigrations } from "./migrations";
import { resolveLifecycleDbPath, resolveLifecycleRootPath } from "./paths";

let cached: TursoDb | null = null;
let cachedEnsured: TursoDb | null = null;

export async function getLifecycleDb(): Promise<TursoDb> {
  if (cached) return cached;

  const dbPath = resolveLifecycleDbPath();
  mkdirSync(resolveLifecycleRootPath(), { recursive: true });
  const db = await createTursoDb({ path: dbPath });
  cached = db;
  return db;
}

export async function ensureLifecycleDb(): Promise<TursoDb> {
  if (cachedEnsured) {
    return cachedEnsured;
  }

  const db = await getLifecycleDb();
  await applyDbMigrations(db);
  cachedEnsured = db;
  return db;
}

export function isMissingLifecycleSchemaError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /no such table/i.test(error.message);
}
