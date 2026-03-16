const LAST_PROJECT_ID_STORAGE_KEY = "lifecycle.desktop.last-project-id";

interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readLastProjectId(storage?: StorageLike): string | null {
  return getStorage(storage)?.getItem(LAST_PROJECT_ID_STORAGE_KEY) ?? null;
}

export function writeLastProjectId(projectId: string, storage?: StorageLike): void {
  getStorage(storage)?.setItem(LAST_PROJECT_ID_STORAGE_KEY, projectId);
}

export function clearLastProjectId(storage?: StorageLike): void {
  getStorage(storage)?.removeItem(LAST_PROJECT_ID_STORAGE_KEY);
}
