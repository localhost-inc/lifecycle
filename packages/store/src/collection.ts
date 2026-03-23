import { createCollection, type Collection } from "@tanstack/db";
import type { SqlDriver } from "./driver";

interface ChangeMessage<T> {
  type: "insert" | "update";
  value: T;
  key?: string;
}

interface SqlSyncControls<T extends object> {
  begin: () => void;
  write: (msg: ChangeMessage<T>) => void;
  commit: () => void;
  truncate: () => void;
  markReady: () => void;
}

export interface SqlCollection<T extends object> {
  collection: Collection<T, string>;
  /** Full reload from SQL. Use sparingly — prefer upsert() for incremental updates. */
  refresh: () => Promise<void>;
  /** Push a single item into the synced layer. Instant, no SQL round-trip, no truncate. */
  upsert: (item: T) => void;
  getError: () => Error | null;
  subscribeState: (listener: () => void) => () => void;
}

/**
 * Creates a TanStack DB collection backed by a SQL query.
 *
 * - Initial hydration loads all rows via `loadFn`.
 * - `upsert(item)` pushes a single item into the synced layer (instant).
 * - `refresh()` does a full reload (use sparingly).
 */
export function createSqlCollection<T extends object>(opts: {
  id: string;
  driver: SqlDriver;
  loadFn: (driver: SqlDriver) => Promise<T[]>;
  getKey: (item: T) => string;
}): SqlCollection<T> {
  let controls: SqlSyncControls<T> | null = null;
  let ready = false;
  let loadError: Error | null = null;
  const pendingUpserts: T[] = [];
  const stateListeners = new Set<() => void>();

  function notifyState(): void {
    for (const listener of stateListeners) {
      listener();
    }
  }

  function setLoadError(error: unknown): void {
    loadError = error instanceof Error ? error : new Error(String(error));
    notifyState();
  }

  function clearLoadError(): void {
    if (!loadError) {
      return;
    }

    loadError = null;
    notifyState();
  }

  const collection = createCollection<T, string>({
    id: opts.id,
    getKey: opts.getKey,
    sync: {
      sync: (params) => {
        controls = {
          begin: params.begin,
          write: params.write as SqlSyncControls<T>["write"],
          commit: params.commit,
          truncate: params.truncate,
          markReady: params.markReady,
        };

        void opts.loadFn(opts.driver)
          .then((rows) => {
            if (!controls) return;
            controls.begin();
            controls.truncate();
            for (const row of rows) {
              controls.write({ type: "insert", value: row });
            }
            controls.commit();
            controls.markReady();
            for (const row of rows) {
              knownKeys.add(opts.getKey(row));
            }
            ready = true;
            clearLoadError();

            if (pendingUpserts.length > 0) {
              controls.begin();
              for (const item of pendingUpserts) {
                controls.write({ type: "insert", value: item });
              }
              controls.commit();
              pendingUpserts.length = 0;
            }
          })
          .catch((error) => {
            console.error(`[sql-collection:${opts.id}] hydration failed`, error);
            if (controls) {
              controls.begin();
              controls.truncate();
              controls.commit();
              controls.markReady();
            }
            ready = true;
            setLoadError(error);
          });

        return () => {};
      },
      getSyncMetadata: () => ({}),
    },
    startSync: true,
    gcTime: 0,
  });

  async function refresh(): Promise<void> {
    if (!controls) return;
    try {
      const rows = await opts.loadFn(opts.driver);
      controls.begin();
      controls.truncate();
      for (const row of rows) {
        controls.write({ type: "insert", value: row });
      }
      controls.commit();
      clearLoadError();
    } catch (error) {
      setLoadError(error);
      throw error;
    }
  }

  const knownKeys = new Set<string>();

  function upsert(item: T): void {
    if (!ready || !controls) {
      pendingUpserts.push(item);
      return;
    }
    const key = opts.getKey(item);
    const type = knownKeys.has(key) ? "update" as const : "insert" as const;
    knownKeys.add(key);
    controls.begin();
    controls.write({ type, value: item, ...(type === "update" ? { key } : {}) });
    controls.commit();
  }

  return {
    collection,
    refresh,
    upsert,
    getError: () => loadError,
    subscribeState: (listener) => {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
  };
}
