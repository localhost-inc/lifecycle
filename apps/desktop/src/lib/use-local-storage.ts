import { useCallback, useSyncExternalStore } from "react";

export interface LocalStorageLike {
  getItem(key: string): string | null;
  removeItem?(key: string): void;
  setItem(key: string, value: string): void;
}

export interface LocalStorageOptions<T> {
  defaultValue: T;
  parse?: (rawValue: string) => T;
  serialize?: (value: T) => string;
  storage?: LocalStorageLike | null;
  validate?: (value: T) => boolean;
}

type LocalStorageUpdater<T> = T | ((currentValue: T) => T);

const storageKeyListeners = new Map<string, Set<() => void>>();

function getBrowserStorage(): LocalStorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function resolveStorage(storage?: LocalStorageLike | null): LocalStorageLike | null {
  if (storage !== undefined) {
    return storage;
  }

  return getBrowserStorage();
}

function subscribeToStorageKey(storageKey: string, listener: () => void) {
  const existingListeners = storageKeyListeners.get(storageKey);
  if (existingListeners) {
    existingListeners.add(listener);
  } else {
    storageKeyListeners.set(storageKey, new Set([listener]));
  }

  return () => {
    const listeners = storageKeyListeners.get(storageKey);
    if (!listeners) {
      return;
    }

    listeners.delete(listener);
    if (listeners.size === 0) {
      storageKeyListeners.delete(storageKey);
    }
  };
}

function emitStorageKey(storageKey: string) {
  for (const listener of storageKeyListeners.get(storageKey) ?? []) {
    listener();
  }
}

export function readLocalStorageValue<T>(storageKey: string, options: LocalStorageOptions<T>): T {
  const { defaultValue, parse, storage, validate } = options;
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return defaultValue;
  }

  const rawValue = resolvedStorage.getItem(storageKey);
  if (rawValue === null) {
    return defaultValue;
  }

  try {
    const parsedValue = parse ? parse(rawValue) : (JSON.parse(rawValue) as T);
    if (validate && !validate(parsedValue)) {
      return defaultValue;
    }

    return parsedValue;
  } catch {
    return defaultValue;
  }
}

export function writeLocalStorageValue<T>(
  storageKey: string,
  value: T,
  options: Pick<LocalStorageOptions<T>, "serialize" | "storage"> = {},
): void {
  const { serialize, storage } = options;
  const resolvedStorage = resolveStorage(storage);
  if (resolvedStorage) {
    try {
      const rawValue = serialize ? serialize(value) : JSON.stringify(value);
      resolvedStorage.setItem(storageKey, rawValue);
    } catch {
      // Ignore persistence failures; callers still get the in-memory update.
    }
  }

  emitStorageKey(storageKey);
}

export function removeLocalStorageValue(
  storageKey: string,
  storage?: LocalStorageLike | null,
): void {
  const resolvedStorage = resolveStorage(storage);
  if (resolvedStorage?.removeItem) {
    try {
      resolvedStorage.removeItem(storageKey);
    } catch {
      // Ignore persistence failures; callers still get the in-memory update.
    }
  }

  emitStorageKey(storageKey);
}

export function useLocalStorage<T>(
  storageKey: string,
  options: LocalStorageOptions<T>,
): readonly [T, (nextValue: LocalStorageUpdater<T>) => void] {
  const { defaultValue, parse, serialize, storage, validate } = options;

  const getSnapshot = useCallback(
    () =>
      readLocalStorageValue(storageKey, {
        defaultValue,
        parse,
        storage,
        validate,
      }),
    [defaultValue, parse, storage, storageKey, validate],
  );

  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribeLocal = subscribeToStorageKey(storageKey, listener);

      if (typeof window === "undefined") {
        return unsubscribeLocal;
      }

      const handleStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== storageKey) {
          return;
        }

        listener();
      };

      window.addEventListener("storage", handleStorage);
      return () => {
        unsubscribeLocal();
        window.removeEventListener("storage", handleStorage);
      };
    },
    [storageKey],
  );

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback(
    (nextValue: LocalStorageUpdater<T>) => {
      const currentValue = getSnapshot();
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (currentValue: T) => T)(currentValue)
          : nextValue;

      writeLocalStorageValue(storageKey, resolvedValue, {
        serialize,
        storage,
      });
    },
    [getSnapshot, serialize, storage, storageKey],
  );

  return [value, setValue] as const;
}
