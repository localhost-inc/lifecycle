import {
  createCollection,
  type Collection,
  type CollectionConfig,
  type PendingMutation,
} from "@tanstack/db";
import type { SqlDriver } from "@lifecycle/db";

type ChangeMessage<T> =
  | { type: "insert"; value: T }
  | { type: "update"; key: string; value: T }
  | { type: "delete"; key: string; value: T };

interface SqlSyncControls<T extends object> {
  begin: () => void;
  write: (msg: ChangeMessage<T>) => void;
  commit: () => void;
  truncate: () => void;
  markReady: () => void;
}

export interface SqlCollectionUtils<T extends object> {
  [key: string]: (...args: Array<any>) => any;
  /** Full reload from SQL. Use sparingly — prefer upsert() for incremental updates. */
  refresh: () => Promise<void>;
  /** Push a single item into the synced layer. Instant, no SQL round-trip, no truncate. */
  upsert: (item: T) => void;
  getError: () => Error | null;
  subscribeState: (listener: () => void) => () => void;
}

export type SqlCollection<T extends object> = Collection<
  T,
  string,
  SqlCollectionUtils<T>,
  never,
  T
>;

type SqlMutationHandler<T extends object> = Pick<
  CollectionConfig<T, string>,
  "onInsert" | "onUpdate" | "onDelete"
>;

/**
 * Creates a TanStack DB collection backed by a SQL query.
 *
 * - Initial hydration loads all rows via `loadFn`.
 * - `upsert(item)` pushes a single item into the synced layer (instant).
 * - `refresh()` does a full reload (use sparingly).
 */
export function createSqlCollection<T extends object>(
  opts: {
    id: string;
    driver: SqlDriver;
    loadFn: (driver: SqlDriver) => Promise<T[]>;
    getKey: (item: T) => string;
  } & SqlMutationHandler<T>,
): SqlCollection<T> {
  let controls: SqlSyncControls<T> | null = null;
  let ready = false;
  let loadError: Error | null = null;
  const pendingUpserts: T[] = [];
  const stateListeners = new Set<() => void>();
  const knownKeys = new Set<string>();

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

  function applySnapshot(rows: T[]): void {
    if (!controls) {
      return;
    }

    controls.begin();
    controls.truncate();
    knownKeys.clear();
    for (const row of rows) {
      controls.write({ type: "insert", value: row });
      knownKeys.add(opts.getKey(row));
    }
    controls.commit();
  }

  function applyChange(change: ChangeMessage<T>): void {
    if (!controls) {
      return;
    }

    switch (change.type) {
      case "insert":
        knownKeys.add(opts.getKey(change.value));
        controls.write(change);
        return;
      case "update":
        knownKeys.add(change.key);
        controls.write(change);
        return;
      case "delete":
        knownKeys.delete(change.key);
        controls.write(change);
        return;
    }
  }

  function confirmOperationsSync(mutations: Array<PendingMutation<T>>): void {
    if (!controls) {
      return;
    }

    controls.begin();
    for (const mutation of mutations) {
      if (mutation.type === "delete") {
        applyChange({
          type: "delete",
          key: String(mutation.key),
          value: mutation.original as T,
        });
        continue;
      }

      const key = opts.getKey(mutation.modified);
      if (knownKeys.has(key)) {
        applyChange({ type: "update", key, value: mutation.modified });
        continue;
      }

      applyChange({ type: "insert", value: mutation.modified });
    }
    controls.commit();
  }

  const wrappedOnInsert: SqlMutationHandler<T>["onInsert"] = opts.onInsert
    ? async (params) => {
        const handlerResult = (await opts.onInsert?.(params)) ?? {};
        confirmOperationsSync(params.transaction.mutations);
        return handlerResult;
      }
    : undefined;

  const wrappedOnUpdate: SqlMutationHandler<T>["onUpdate"] = opts.onUpdate
    ? async (params) => {
        const handlerResult = (await opts.onUpdate?.(params)) ?? {};
        confirmOperationsSync(params.transaction.mutations);
        return handlerResult;
      }
    : undefined;

  const wrappedOnDelete: SqlMutationHandler<T>["onDelete"] = opts.onDelete
    ? async (params) => {
        const handlerResult = (await opts.onDelete?.(params)) ?? {};
        confirmOperationsSync(params.transaction.mutations);
        return handlerResult;
      }
    : undefined;

  const collectionConfig = {
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

        void opts
          .loadFn(opts.driver)
          .then((rows) => {
            if (!controls) return;
            applySnapshot(rows);
            controls.markReady();
            ready = true;
            clearLoadError();

            if (pendingUpserts.length > 0) {
              controls.begin();
              for (const item of pendingUpserts) {
                const key = opts.getKey(item);
                applyChange(
                  knownKeys.has(key)
                    ? { type: "update", key, value: item }
                    : { type: "insert", value: item },
                );
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
    ...(wrappedOnInsert ? { onInsert: wrappedOnInsert } : {}),
    ...(wrappedOnUpdate ? { onUpdate: wrappedOnUpdate } : {}),
    ...(wrappedOnDelete ? { onDelete: wrappedOnDelete } : {}),
    utils: {
      refresh,
      upsert,
      getError: () => loadError,
      subscribeState: (listener: () => void) => {
        stateListeners.add(listener);
        return () => {
          stateListeners.delete(listener);
        };
      },
    } satisfies SqlCollectionUtils<T>,
  } satisfies CollectionConfig<T, string, never, SqlCollectionUtils<T>>;

  const collection = createCollection<T, string, SqlCollectionUtils<T>>(collectionConfig);

  async function refresh(): Promise<void> {
    if (!controls) return;
    try {
      const rows = await opts.loadFn(opts.driver);
      applySnapshot(rows);
      clearLoadError();
    } catch (error) {
      setLoadError(error);
      throw error;
    }
  }

  function upsert(item: T): void {
    if (!ready || !controls) {
      pendingUpserts.push(item);
      return;
    }
    const key = opts.getKey(item);
    controls.begin();
    applyChange(
      knownKeys.has(key) ? { type: "update", key, value: item } : { type: "insert", value: item },
    );
    controls.commit();
  }

  return collection;
}
