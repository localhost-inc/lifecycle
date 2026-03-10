import type { LifecycleEvent, LifecycleEventKind } from "@lifecycle/contracts";
import type { QuerySource } from "./source";

export type QueryKeyPart = string | number | boolean | null;
export type QueryKey = readonly QueryKeyPart[];

export type QueryStatus = "idle" | "loading" | "ready" | "error";

export interface QuerySnapshot<T> {
  data: T | undefined;
  error: unknown;
  status: QueryStatus;
}

export type QueryUpdate<T> =
  | { kind: "replace"; data: T }
  | { kind: "invalidate" }
  | { kind: "none" };

interface BaseQueryDescriptor<T> {
  key: QueryKey;
  fetch(source: QuerySource): Promise<T>;
}

interface PassiveQueryDescriptor<T> extends BaseQueryDescriptor<T> {
  eventKinds?: never;
  reduce?: never;
}

interface EventQueryDescriptor<T> extends BaseQueryDescriptor<T> {
  eventKinds: readonly LifecycleEventKind[];
  reduce(current: T | undefined, event: LifecycleEvent): QueryUpdate<T>;
}

export type QueryDescriptor<T> = PassiveQueryDescriptor<T> | EventQueryDescriptor<T>;

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

function isEventQueryDescriptor<T>(
  descriptor: QueryDescriptor<T>,
): descriptor is EventQueryDescriptor<T> {
  return "reduce" in descriptor && typeof descriptor.reduce === "function";
}

function eventKindsKey(kinds: readonly LifecycleEventKind[]): string {
  return [...new Set(kinds)].sort().join("\0");
}

export type LifecycleEventSubscriber = (
  kinds: readonly LifecycleEventKind[],
  listener: (event: LifecycleEvent) => void,
) => Promise<() => void>;

export class QueryClient {
  private readonly entries = new Map<string, QueryEntry<unknown>>();
  private readonly entriesByEventKind = new Map<LifecycleEventKind, Set<QueryEntry<unknown>>>();
  private readonly source: QuerySource;
  private readonly subscribeToEvents: LifecycleEventSubscriber;
  private sourceUnsubscribe: (() => void) | null = null;
  private subscriptionKindsKey = "";
  private syncPromise: Promise<void> = Promise.resolve();

  constructor(source: QuerySource, subscribeToEvents: LifecycleEventSubscriber) {
    this.source = source;
    this.subscribeToEvents = subscribeToEvents;
  }

  dispose(): void {
    this.entriesByEventKind.clear();
    this.subscriptionKindsKey = "";
    this.sourceUnsubscribe?.();
    this.sourceUnsubscribe = null;
    this.syncPromise = Promise.resolve();
  }

  subscribe<T>(descriptor: QueryDescriptor<T>, listener: () => void): () => void {
    const entry = this.ensureEntry(descriptor);
    const wasActive = entry.listeners.size > 0;
    entry.listeners.add(listener);

    if (!wasActive && isEventQueryDescriptor(entry.descriptor)) {
      this.indexEntry(entry, entry.descriptor);
      void this.syncEventSubscription();
    }

    if (entry.snapshot.status === "idle" && entry.promise === null) {
      void this.fetchEntry(entry);
    }

    return () => {
      if (!entry.listeners.delete(listener)) {
        return;
      }

      if (entry.listeners.size === 0 && isEventQueryDescriptor(entry.descriptor)) {
        this.unindexEntry(entry, entry.descriptor);
        void this.syncEventSubscription();
      }
    };
  }

  getSnapshot<T>(descriptor: QueryDescriptor<T>): QuerySnapshot<T> {
    return this.ensureEntry(descriptor).snapshot;
  }

  async refetch<T>(descriptor: QueryDescriptor<T>): Promise<void> {
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
      const previousDescriptor = typedEntry.descriptor;
      const previousKindsKey = isEventQueryDescriptor(previousDescriptor)
        ? eventKindsKey(previousDescriptor.eventKinds)
        : "";
      const nextKindsKey = isEventQueryDescriptor(descriptor)
        ? eventKindsKey(descriptor.eventKinds)
        : "";

      if (typedEntry.listeners.size > 0 && previousKindsKey !== nextKindsKey) {
        if (isEventQueryDescriptor(previousDescriptor)) {
          this.unindexEntry(typedEntry, previousDescriptor);
        }
        if (isEventQueryDescriptor(descriptor)) {
          this.indexEntry(typedEntry, descriptor);
        }
        void this.syncEventSubscription();
      }

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

  private indexEntry<T>(entry: QueryEntry<T>, descriptor: EventQueryDescriptor<T>): void {
    for (const kind of new Set(descriptor.eventKinds)) {
      let entries = this.entriesByEventKind.get(kind);
      if (!entries) {
        entries = new Set();
        this.entriesByEventKind.set(kind, entries);
      }

      entries.add(entry as QueryEntry<unknown>);
    }
  }

  private unindexEntry<T>(entry: QueryEntry<T>, descriptor: EventQueryDescriptor<T>): void {
    for (const kind of new Set(descriptor.eventKinds)) {
      const entries = this.entriesByEventKind.get(kind);
      if (!entries) {
        continue;
      }

      entries.delete(entry as QueryEntry<unknown>);
      if (entries.size === 0) {
        this.entriesByEventKind.delete(kind);
      }
    }
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
        console.error("Query failed:", entry.descriptor.key, error);
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

  private syncEventSubscription(): Promise<void> {
    const nextTask = this.syncPromise.then(async () => {
      const nextKinds = [...this.entriesByEventKind.keys()].sort();
      const nextKindsKey = eventKindsKey(nextKinds);

      if (nextKindsKey === this.subscriptionKindsKey) {
        return;
      }

      this.subscriptionKindsKey = nextKindsKey;
      this.sourceUnsubscribe?.();
      this.sourceUnsubscribe = null;

      if (nextKinds.length === 0) {
        return;
      }

      const unsubscribe = await this.subscribeToEvents(nextKinds, (event) => {
        this.handleEvent(event);
      });

      if (this.subscriptionKindsKey !== nextKindsKey) {
        unsubscribe();
        return;
      }

      this.sourceUnsubscribe = unsubscribe;
    });

    this.syncPromise = nextTask.catch((error) => {
      console.error("Failed to synchronize lifecycle event subscriptions:", error);
    });

    return nextTask;
  }

  private handleEvent(event: LifecycleEvent): void {
    const entries = this.entriesByEventKind.get(event.kind);
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      const descriptor = entry.descriptor;
      if (!isEventQueryDescriptor(descriptor)) {
        continue;
      }

      const reduce = descriptor.reduce;
      const current = entry.snapshot.data;
      const update = reduce(current, event);

      if (update.kind === "none") {
        continue;
      }

      if (update.kind === "replace") {
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
