import type { StoreEvent } from "./events";
import type { StoreSource } from "./source";

export type QueryKeyPart = string | number | boolean | null;
export type QueryKey = readonly QueryKeyPart[];

export type QueryStatus = "idle" | "loading" | "ready" | "error";

export interface QuerySnapshot<T> {
  data: T | undefined;
  error: unknown;
  status: QueryStatus;
}

export type QueryUpdate<T> =
  | { type: "replace"; data: T }
  | { type: "invalidate" }
  | { type: "none" };

export interface QueryDescriptor<T> {
  key: QueryKey;
  fetch(source: StoreSource): Promise<T>;
  reduce?(current: T | undefined, event: StoreEvent): QueryUpdate<T>;
}

interface QueryEntry<T> {
  descriptor: QueryDescriptor<T>;
  keyHash: string;
  listeners: Set<() => void>;
  promise: Promise<void> | null;
  snapshot: QuerySnapshot<T>;
}

function hashKey(key: QueryKey): string {
  return JSON.stringify(key);
}

function notify<T>(entry: QueryEntry<T>): void {
  for (const listener of entry.listeners) {
    listener();
  }
}

function createInitialSnapshot<T>(): QuerySnapshot<T> {
  return {
    data: undefined,
    error: null,
    status: "idle",
  };
}

export class StoreClient {
  private readonly entries = new Map<string, QueryEntry<unknown>>();
  private readonly source: StoreSource;
  private sourceUnsubscribe: (() => void) | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor(source: StoreSource) {
    this.source = source;
  }

  async connect(): Promise<void> {
    if (this.sourceUnsubscribe) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.source
      .subscribe((event) => {
        this.handleEvent(event);
      })
      .then((unsubscribe) => {
        this.sourceUnsubscribe = unsubscribe;
      })
      .finally(() => {
        this.connectPromise = null;
      });

    return this.connectPromise;
  }

  dispose(): void {
    this.sourceUnsubscribe?.();
    this.sourceUnsubscribe = null;
    this.connectPromise = null;
  }

  subscribe<T>(descriptor: QueryDescriptor<T>, listener: () => void): () => void {
    void this.connect();
    const entry = this.ensureEntry(descriptor);
    entry.listeners.add(listener);

    if (entry.snapshot.status === "idle" && entry.promise === null) {
      void this.fetchEntry(entry);
    }

    return () => {
      entry.listeners.delete(listener);
    };
  }

  getSnapshot<T>(descriptor: QueryDescriptor<T>): QuerySnapshot<T> {
    return this.ensureEntry(descriptor).snapshot;
  }

  async refetch<T>(descriptor: QueryDescriptor<T>): Promise<void> {
    await this.connect();
    await this.fetchEntry(this.ensureEntry(descriptor), true);
  }

  invalidate(key: QueryKey): void {
    const keyHash = hashKey(key);
    this.invalidateMatching((entryKey) => hashKey(entryKey) === keyHash);
  }

  invalidateMatching(match: (key: QueryKey) => boolean): void {
    for (const entry of this.entries.values()) {
      if (!match(entry.descriptor.key)) {
        continue;
      }

      entry.snapshot = {
        ...entry.snapshot,
        error: null,
        status: "idle",
      };
      notify(entry);

      if (entry.listeners.size > 0) {
        void this.fetchEntry(entry);
      }
    }
  }

  private ensureEntry<T>(descriptor: QueryDescriptor<T>): QueryEntry<T> {
    const keyHash = hashKey(descriptor.key);
    const existing = this.entries.get(keyHash);

    if (existing) {
      const typedEntry = existing as QueryEntry<T>;
      typedEntry.descriptor = descriptor;
      return typedEntry;
    }

    const created: QueryEntry<T> = {
      descriptor,
      keyHash,
      listeners: new Set(),
      promise: null,
      snapshot: createInitialSnapshot(),
    };
    this.entries.set(keyHash, created as QueryEntry<unknown>);
    return created;
  }

  private async fetchEntry<T>(entry: QueryEntry<T>, force = false): Promise<void> {
    if (entry.promise && !force) {
      return entry.promise;
    }

    entry.snapshot = {
      ...entry.snapshot,
      error: null,
      status: "loading",
    };
    notify(entry);

    const fetchPromise = entry.descriptor
      .fetch(this.source)
      .then((data) => {
        entry.snapshot = {
          data,
          error: null,
          status: "ready",
        };
        notify(entry);
      })
      .catch((error: unknown) => {
        console.error("Store query failed:", entry.descriptor.key, error);
        entry.snapshot = {
          ...entry.snapshot,
          error,
          status: "error",
        };
        notify(entry);
      })
      .finally(() => {
        entry.promise = null;
      });

    entry.promise = fetchPromise;
    return fetchPromise;
  }

  private handleEvent(event: StoreEvent): void {
    for (const entry of this.entries.values()) {
      const reduce = entry.descriptor.reduce;
      if (!reduce) {
        continue;
      }

      const current = entry.snapshot.data;
      const update = reduce(current, event);

      if (update.type === "none") {
        continue;
      }

      if (update.type === "replace") {
        entry.snapshot = {
          data: update.data,
          error: null,
          status: "ready",
        };
        notify(entry);
        continue;
      }

      entry.snapshot = {
        ...entry.snapshot,
        error: null,
        status: "idle",
      };
      notify(entry);

      if (entry.listeners.size > 0) {
        void this.fetchEntry(entry);
      }
    }
  }
}
