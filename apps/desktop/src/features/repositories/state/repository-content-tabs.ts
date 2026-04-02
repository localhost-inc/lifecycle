const LAST_REPOSITORY_ID_STORAGE_KEY = "lifecycle.desktop.last-repository-id";
const WORKSPACE_SUB_PATH_PREFIX = "/workspaces/";

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

export function readLastRepositoryId(storage?: StorageLike): string | null {
  return getStorage(storage)?.getItem(LAST_REPOSITORY_ID_STORAGE_KEY) ?? null;
}

export function writeLastRepositoryId(repositoryId: string, storage?: StorageLike): void {
  getStorage(storage)?.setItem(LAST_REPOSITORY_ID_STORAGE_KEY, repositoryId);
}

export function clearLastRepositoryId(storage?: StorageLike): void {
  getStorage(storage)?.removeItem(LAST_REPOSITORY_ID_STORAGE_KEY);
}

export function resolvePersistedRepositorySubPath({
  pathname,
  repositoryId,
  repositoryWorkspaceId,
}: {
  pathname: string;
  repositoryId: string;
  repositoryWorkspaceId?: string | null;
}): string | null {
  const repositoryPrefix = `/repositories/${repositoryId}`;
  if (!pathname.startsWith(repositoryPrefix)) {
    return null;
  }

  const subPath = pathname.slice(repositoryPrefix.length);
  if (!subPath || subPath === "/") {
    return null;
  }

  if (subPath.startsWith(WORKSPACE_SUB_PATH_PREFIX) && repositoryWorkspaceId) {
    return `${WORKSPACE_SUB_PATH_PREFIX}${repositoryWorkspaceId}`;
  }

  return subPath;
}

export function resolveRepositoryNavigationTarget({
  currentPathname,
  repositoryId,
  repositoryWorkspaceId,
  storedSubPath,
}: {
  currentPathname?: string | null;
  repositoryId: string;
  repositoryWorkspaceId?: string | null;
  storedSubPath?: string | null;
}): string {
  const currentSubPath = currentPathname
    ? resolvePersistedRepositorySubPath({
        pathname: currentPathname,
        repositoryId,
        repositoryWorkspaceId,
      })
    : null;
  const persistedSubPath = storedSubPath
    ? resolvePersistedRepositorySubPath({
        pathname: `/repositories/${repositoryId}${storedSubPath}`,
        repositoryId,
        repositoryWorkspaceId,
      })
    : null;
  const subPath = currentSubPath ?? persistedSubPath;

  return subPath ? `/repositories/${repositoryId}${subPath}` : `/repositories/${repositoryId}`;
}

// Per-repository sub-path persistence
// Stores the last visited sub-path within each repository (e.g. "/workspaces/abc123")
const LAST_REPOSITORY_PATHS_STORAGE_KEY = "lifecycle.desktop.last-repository-paths";

export function readRepositoryPaths(storage?: StorageLike): Record<string, string> {
  try {
    const raw = getStorage(storage)?.getItem(LAST_REPOSITORY_PATHS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function readLastRepositorySubPath(
  repositoryId: string,
  storage?: StorageLike,
): string | null {
  return readRepositoryPaths(storage)[repositoryId] ?? null;
}

export function writeLastRepositorySubPath(
  repositoryId: string,
  subPath: string,
  storage?: StorageLike,
): void {
  const paths = readRepositoryPaths(storage);
  paths[repositoryId] = subPath;
  getStorage(storage)?.setItem(LAST_REPOSITORY_PATHS_STORAGE_KEY, JSON.stringify(paths));
}

export function clearLastRepositorySubPath(repositoryId: string, storage?: StorageLike): void {
  const paths = readRepositoryPaths(storage);
  delete paths[repositoryId];
  getStorage(storage)?.setItem(LAST_REPOSITORY_PATHS_STORAGE_KEY, JSON.stringify(paths));
}
