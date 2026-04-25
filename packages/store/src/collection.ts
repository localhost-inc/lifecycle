import {
  createCollection,
  type Collection,
  type CollectionConfig,
  type PendingMutation,
} from "@tanstack/db";

type ChangeMessage<T> =
  | { type: "insert"; value: T }
  | { type: "update"; key: string; value: T }
  | { type: "delete"; key: string; value: T };

interface BridgeSyncControls<T extends object> {
  begin: () => void;
  write: (msg: ChangeMessage<T>) => void;
  commit: () => void;
  truncate: () => void;
  markReady: () => void;
}

export interface BridgeRequestOptions<Body = unknown> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: Body;
}

export interface BridgeTransport {
  request<Response, Body = unknown>(options: BridgeRequestOptions<Body>): Promise<Response>;
}

export interface BridgeCollectionUtils<T extends object> {
  [key: string]: (...args: Array<any>) => any;
  refresh: () => Promise<void>;
  upsert: (item: T) => void;
  getError: () => Error | null;
  subscribeState: (listener: () => void) => () => void;
}

export type BridgeCollection<T extends object> = Collection<
  T,
  string,
  BridgeCollectionUtils<T>,
  never,
  T
>;

type BridgeMutationHandler<T extends object> = Pick<
  CollectionConfig<T, string>,
  "onInsert" | "onUpdate" | "onDelete"
>;

export function createFetchBridgeTransport(baseUrl: string): BridgeTransport {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    async request<Response, Body = unknown>({
      method = "GET",
      path,
      query,
      body,
    }: BridgeRequestOptions<Body>): Promise<Response> {
      const url = new URL(`${normalizedBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }

      const response = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Lifecycle bridge ${method} ${url.pathname} failed with ${response.status}${text ? `: ${text}` : ""}`,
        );
      }

      if (response.status === 204) {
        return undefined as Response;
      }

      return (await response.json()) as Response;
    },
  };
}

export function createBridgeCollection<T extends object>(
  opts: {
    id: string;
    load: () => Promise<T[]>;
    getKey: (item: T) => string;
  } & BridgeMutationHandler<T>,
): BridgeCollection<T> {
  let controls: BridgeSyncControls<T> | null = null;
  let ready = false;
  let loadError: Error | null = null;
  const pendingUpserts: T[] = [];
  const stateListeners = new Set<() => void>();
  const knownKeys = new Set<string>();

  function notifyState(): void {
    for (const listener of stateListeners) listener();
  }

  function setLoadError(error: unknown): void {
    loadError = error instanceof Error ? error : new Error(String(error));
    notifyState();
  }

  function clearLoadError(): void {
    if (!loadError) return;
    loadError = null;
    notifyState();
  }

  function applySnapshot(rows: T[]): void {
    if (!controls) return;
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
    if (!controls) return;
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
    if (!controls) return;
    controls.begin();
    for (const mutation of mutations) {
      if (mutation.type === "delete") {
        applyChange({ type: "delete", key: String(mutation.key), value: mutation.original as T });
        continue;
      }

      const key = opts.getKey(mutation.modified);
      applyChange(
        knownKeys.has(key)
          ? { type: "update", key, value: mutation.modified }
          : { type: "insert", value: mutation.modified },
      );
    }
    controls.commit();
  }

  const wrappedOnInsert: BridgeMutationHandler<T>["onInsert"] = opts.onInsert
    ? async (params) => {
        const handlerResult = (await opts.onInsert?.(params)) ?? {};
        confirmOperationsSync(params.transaction.mutations);
        return handlerResult;
      }
    : undefined;

  const wrappedOnUpdate: BridgeMutationHandler<T>["onUpdate"] = opts.onUpdate
    ? async (params) => {
        const handlerResult = (await opts.onUpdate?.(params)) ?? {};
        confirmOperationsSync(params.transaction.mutations);
        return handlerResult;
      }
    : undefined;

  const wrappedOnDelete: BridgeMutationHandler<T>["onDelete"] = opts.onDelete
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
          write: params.write as BridgeSyncControls<T>["write"],
          commit: params.commit,
          truncate: params.truncate,
          markReady: params.markReady,
        };

        void opts
          .load()
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
            console.error(`[bridge-collection:${opts.id}] hydration failed`, error);
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
    } satisfies BridgeCollectionUtils<T>,
  } satisfies CollectionConfig<T, string, never, BridgeCollectionUtils<T>>;

  const collection = createCollection<T, string, BridgeCollectionUtils<T>>(collectionConfig);

  async function refresh(): Promise<void> {
    if (!controls) return;
    try {
      applySnapshot(await opts.load());
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
