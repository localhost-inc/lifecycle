const LAST_PROJECT_ID_STORAGE_KEY = "lifecycle.desktop.last-project-id";
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

export function readLastProjectId(storage?: StorageLike): string | null {
  return getStorage(storage)?.getItem(LAST_PROJECT_ID_STORAGE_KEY) ?? null;
}

export function writeLastProjectId(projectId: string, storage?: StorageLike): void {
  getStorage(storage)?.setItem(LAST_PROJECT_ID_STORAGE_KEY, projectId);
}

export function clearLastProjectId(storage?: StorageLike): void {
  getStorage(storage)?.removeItem(LAST_PROJECT_ID_STORAGE_KEY);
}

export function resolvePersistedProjectSubPath({
  pathname,
  projectId,
  repositoryWorkspaceId,
}: {
  pathname: string;
  projectId: string;
  repositoryWorkspaceId?: string | null;
}): string | null {
  const projectPrefix = `/projects/${projectId}`;
  if (!pathname.startsWith(projectPrefix)) {
    return null;
  }

  const subPath = pathname.slice(projectPrefix.length);
  if (!subPath || subPath === "/") {
    return null;
  }

  if (subPath.startsWith(WORKSPACE_SUB_PATH_PREFIX) && repositoryWorkspaceId) {
    return `${WORKSPACE_SUB_PATH_PREFIX}${repositoryWorkspaceId}`;
  }

  return subPath;
}

export function resolveProjectNavigationTarget({
  currentPathname,
  projectId,
  repositoryWorkspaceId,
  storedSubPath,
}: {
  currentPathname?: string | null;
  projectId: string;
  repositoryWorkspaceId?: string | null;
  storedSubPath?: string | null;
}): string {
  const currentSubPath = currentPathname
    ? resolvePersistedProjectSubPath({
        pathname: currentPathname,
        projectId,
        repositoryWorkspaceId,
      })
    : null;
  const persistedSubPath = storedSubPath
    ? resolvePersistedProjectSubPath({
        pathname: `/projects/${projectId}${storedSubPath}`,
        projectId,
        repositoryWorkspaceId,
      })
    : null;
  const subPath = currentSubPath ?? persistedSubPath;

  return subPath ? `/projects/${projectId}${subPath}` : `/projects/${projectId}`;
}

// Per-project sub-path persistence
// Stores the last visited sub-path within each project (e.g. "/workspaces/abc123")
const LAST_PROJECT_PATHS_STORAGE_KEY = "lifecycle.desktop.last-project-paths";

export function readProjectPaths(storage?: StorageLike): Record<string, string> {
  try {
    const raw = getStorage(storage)?.getItem(LAST_PROJECT_PATHS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function readLastProjectSubPath(projectId: string, storage?: StorageLike): string | null {
  return readProjectPaths(storage)[projectId] ?? null;
}

export function writeLastProjectSubPath(
  projectId: string,
  subPath: string,
  storage?: StorageLike,
): void {
  const paths = readProjectPaths(storage);
  paths[projectId] = subPath;
  getStorage(storage)?.setItem(LAST_PROJECT_PATHS_STORAGE_KEY, JSON.stringify(paths));
}

export function clearLastProjectSubPath(projectId: string, storage?: StorageLike): void {
  const paths = readProjectPaths(storage);
  delete paths[projectId];
  getStorage(storage)?.setItem(LAST_PROJECT_PATHS_STORAGE_KEY, JSON.stringify(paths));
}
