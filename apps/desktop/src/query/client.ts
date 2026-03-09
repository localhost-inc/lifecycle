import type { LifecycleEvent, LifecycleEventType } from "@lifecycle/contracts";
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
  | { type: "replace"; data: T }
  | { type: "invalidate" }
  | { type: "none" };

interface BaseQueryDescriptor<T> {
  key: QueryKey;
  fetch(source: QuerySource): Promise<T>;
}

interface PassiveQueryDescriptor<T> extends BaseQueryDescriptor<T> {
  eventTypes?: never;
  reduce?: never;
}

interface EventQueryDescriptor<T> extends BaseQueryDescriptor<T> {
  eventTypes: readonly LifecycleEventType[];
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

function eventTypesKey(types: readonly LifecycleEventType[]): string {
  return [...new Set(types)].sort().join("\0");
}

export type LifecycleEventSubscriber = (
  types: readonly LifecycleEventType[],
  listener: (event: LifecycleEvent) => void,
) => Promise<() => void>;

export class QueryClient {
  private readonly entries = new Map<string, QueryEntry<unknown>>();
  private readonly entriesByEventType = new Map<LifecycleEventType, Set<QueryEntry<unknown>>>();
  private readonly source: QuerySource;
  private readonly subscribeToEvents: LifecycleEventSubscriber;
  private sourceUnsubscribe: (() => void) | null = null;
  private subscriptionTypesKey = "";
  private syncPromise: Promise<void> = Promise.resolve();

  constructor(source: QuerySource, subscribeToEvents: LifecycleEventSubscriber) {
    this.source = source;
    this.subscribeToEvents = subscribeToEvents;
  }

  dispose(): void {
    this.entriesByEventType.clear();
    this.subscriptionTypesKey = "";
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
      const previousTypesKey = isEventQueryDescriptor(previousDescriptor)
        ? eventTypesKey(previousDescriptor.eventTypes)
        : "";
      const nextTypesKey = isEventQueryDescriptor(descriptor)
        ? eventTypesKey(descriptor.eventTypes)
        : "";

      if (typedEntry.listeners.size > 0 && previousTypesKey !== nextTypesKey) {
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
    for (const type of new Set(descriptor.eventTypes)) {
      let entries = this.entriesByEventType.get(type);
      if (!entries) {
        entries = new Set();
        this.entriesByEventType.set(type, entries);
      }

      entries.add(entry as QueryEntry<unknown>);
    }
  }

  private unindexEntry<T>(entry: QueryEntry<T>, descriptor: EventQueryDescriptor<T>): void {
    for (const type of new Set(descriptor.eventTypes)) {
      const entries = this.entriesByEventType.get(type);
      if (!entries) {
        continue;
      }

      entries.delete(entry as QueryEntry<unknown>);
      if (entries.size === 0) {
        this.entriesByEventType.delete(type);
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
      const nextTypes = [...this.entriesByEventType.keys()].sort();
      const nextTypesKey = eventTypesKey(nextTypes);

      if (nextTypesKey === this.subscriptionTypesKey) {
        return;
      }

      this.subscriptionTypesKey = nextTypesKey;
      this.sourceUnsubscribe?.();
      this.sourceUnsubscribe = null;

      if (nextTypes.length === 0) {
        return;
      }

      const unsubscribe = await this.subscribeToEvents(nextTypes, (event) => {
        this.handleEvent(event);
      });

      if (this.subscriptionTypesKey !== nextTypesKey) {
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
    const entries = this.entriesByEventType.get(event.type);
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
