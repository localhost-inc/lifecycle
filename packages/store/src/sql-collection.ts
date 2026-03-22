import { createCollection, type Collection } from "@tanstack/db";
import type { SqlDriver } from "./driver";

interface SqlSyncControls<T extends object> {
  begin: () => void;
  write: (msg: { type: "insert"; value: T }) => void;
  commit: () => void;
  truncate: () => void;
  markReady: () => void;
}

export interface SqlCollection<T extends object> {
  collection: Collection<T, string>;
  refresh: () => Promise<void>;
}

/**
 * Creates a TanStack DB collection backed by a SQL query.
 *
 * On initial sync and on every `refresh()` call, it runs the provided
 * `loadFn` against the SqlDriver, truncates the collection, and pushes
 * the full result set as the new synced state. Optimistic mutations
 * (from Phase 2 writes) are preserved across refreshes.
 */
export function createSqlCollection<T extends object>(opts: {
  id: string;
  driver: SqlDriver;
  loadFn: (driver: SqlDriver) => Promise<T[]>;
  getKey: (item: T) => string;
}): SqlCollection<T> {
  let controls: SqlSyncControls<T> | null = null;

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

        // Perform initial hydration
        void opts.loadFn(opts.driver).then((rows) => {
          if (!controls) return;
          controls.begin();
          controls.truncate();
          for (const row of rows) {
            controls.write({ type: "insert", value: row });
          }
          controls.commit();
          controls.markReady();
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
    const rows = await opts.loadFn(opts.driver);
    controls.begin();
    controls.truncate();
    for (const row of rows) {
      controls.write({ type: "insert", value: row });
    }
    controls.commit();
  }

  return { collection, refresh };
}
