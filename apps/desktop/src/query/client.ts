import type { QuerySource } from "@/query/source";

export type QueryKeyPart = string | number | boolean | null;
export type QueryKey = readonly QueryKeyPart[];

export type QueryStatus = "disabled" | "idle" | "loading" | "ready" | "error";

export interface QuerySnapshot<T> {
  data: T | undefined;
  error: unknown;
  status: QueryStatus;
}

export interface QueryDescriptor<T> {
  key: QueryKey;
  fetch(source: QuerySource): Promise<T>;
}

interface QueryEntry<T> {
  descriptor: QueryDescriptor<T>;
  invalidationVersion: number;
  keyHash: string;
  listeners: Set<() => void>;
  promise: Promise<void> | null;
  snapshot: QuerySnapshot<T>;
  stale: boolean;
}

function hashKey(key: QueryKey): string {
  return JSON.stringify(key);
}

function keyStartsWith(key: QueryKey, prefix: QueryKey): boolean {
  if (prefix.length > key.length) {
    return false;
  }

  return prefix.every((part, index) => key[index] === part);
}

function notify<T>(entry: QueryEntry<T>): void {
  for (const listener of entry.listeners) {
    listener();
  }
}

function hasSnapshotData<T>(entry: QueryEntry<T>): boolean {
  return entry.snapshot.data !== undefined;
}

function createInitialSnapshot<T>(): QuerySnapshot<T> {
  return {
    data: undefined,
    error: null,
    status: "idle",
  };
}

export class QueryClient {
  private readonly entries = new Map<string, QueryEntry<unknown>>();
  private readonly source: QuerySource;

  constructor(source: QuerySource) {
    this.source = source;
  }

  dispose(): void {
    this.entries.clear();
  }

  subscribe<T>(descriptor: QueryDescriptor<T>, listener: () => void): () => void {
    const entry = this.ensureEntry(descriptor);
    entry.listeners.add(listener);

    if ((entry.snapshot.status === "idle" || entry.stale) && entry.promise === null) {
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
    await this.fetchEntry(this.ensureEntry(descriptor));
  }

  setData<T>(descriptor: QueryDescriptor<T>, data: T): void {
    const entry = this.ensureEntry(descriptor);
    entry.stale = false;
    entry.snapshot = {
      data,
      error: null,
      status: "ready",
    };
    notify(entry);
  }

  invalidate(key: QueryKey): void {
    const keyHash = hashKey(key);
    this.invalidateMatching((_entryKey, entryKeyHash) => entryKeyHash === keyHash);
  }

  invalidatePrefix(prefix: QueryKey): void {
    this.invalidateMatching((key) => keyStartsWith(key, prefix));
  }

  invalidateMatching(match: (key: QueryKey, keyHash: string) => boolean): void {
    for (const entry of this.entries.values()) {
      if (!match(entry.descriptor.key, entry.keyHash)) {
        continue;
      }

      this.invalidateEntry(entry);

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
      invalidationVersion: 0,
      keyHash,
      listeners: new Set(),
      promise: null,
      snapshot: createInitialSnapshot(),
      stale: false,
    };
    this.entries.set(keyHash, created as QueryEntry<unknown>);
    return created;
  }

  private async fetchEntry<T>(entry: QueryEntry<T>): Promise<void> {
    if (entry.promise) {
      return entry.promise;
    }

    const invalidationVersion = entry.invalidationVersion;

    if (!hasSnapshotData(entry)) {
      entry.snapshot = {
        ...entry.snapshot,
        error: null,
        status: "loading",
      };
      notify(entry);
    }

    const fetchPromise = entry.descriptor
      .fetch(this.source)
      .then((data) => {
        entry.stale = entry.invalidationVersion !== invalidationVersion;
        entry.snapshot = {
          data,
          error: null,
          status: "ready",
        };
        notify(entry);
      })
      .catch((error: unknown) => {
        console.error("Query failed:", entry.descriptor.key, error);
        entry.stale = entry.invalidationVersion !== invalidationVersion;
        entry.snapshot = {
          ...entry.snapshot,
          error,
          status: "error",
        };
        notify(entry);
      })
      .finally(() => {
        entry.promise = null;

        if (entry.stale && entry.listeners.size > 0) {
          void this.fetchEntry(entry);
        }
      });

    entry.promise = fetchPromise;
    return fetchPromise;
  }

  private invalidateEntry<T>(entry: QueryEntry<T>): void {
    entry.invalidationVersion += 1;
    entry.stale = true;
    const nextStatus = hasSnapshotData(entry) ? "ready" : "idle";
    if (entry.snapshot.error === null && entry.snapshot.status === nextStatus) {
      return;
    }

    entry.snapshot = {
      ...entry.snapshot,
      error: null,
      status: nextStatus,
    };
    notify(entry);
  }
}
