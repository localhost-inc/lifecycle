import { normalizeWorkspaceFilePath } from "@/features/workspaces/lib/workspace-file-paths";

const WORKSPACE_FILE_USAGE_STORAGE_KEY = "lifecycle.desktop.workspace-file-usage";
const MAX_WORKSPACE_FILE_USAGE_ENTRIES = 200;
const EMPTY_WORKSPACE_FILE_USAGE: Record<string, WorkspaceFileUsageEntry> = {};

export interface WorkspaceFileUsageEntry {
  count: number;
  lastOpenedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type WorkspaceFileUsageMap = Record<string, Record<string, WorkspaceFileUsageEntry>>;

const listeners = new Set<() => void>();
let workspaceFileUsageVersion = 0;

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkspaceFileUsageEntry(value: unknown): value is WorkspaceFileUsageEntry {
  return (
    isRecord(value) &&
    typeof value.count === "number" &&
    Number.isFinite(value.count) &&
    value.count > 0 &&
    typeof value.lastOpenedAt === "number" &&
    Number.isFinite(value.lastOpenedAt) &&
    value.lastOpenedAt >= 0
  );
}

function readWorkspaceFileUsageMap(storage?: StorageLike): WorkspaceFileUsageMap {
  const target = getStorage(storage);
  if (!target) {
    return {};
  }

  try {
    const raw = target.getItem(WORKSPACE_FILE_USAGE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }

    const workspaceUsageEntries: Array<[string, Record<string, WorkspaceFileUsageEntry>]> = [];

    for (const [workspaceId, value] of Object.entries(parsed)) {
      const workspaceUsage: Record<string, WorkspaceFileUsageEntry> = {};

      if (isRecord(value)) {
        for (const [filePath, entry] of Object.entries(value)) {
          if (isWorkspaceFileUsageEntry(entry)) {
            workspaceUsage[filePath] = entry;
          }
        }
      }

      workspaceUsageEntries.push([workspaceId, workspaceUsage]);
    }

    return Object.fromEntries(workspaceUsageEntries);
  } catch {
    return {};
  }
}

function writeWorkspaceFileUsageMap(map: WorkspaceFileUsageMap, storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) {
    return;
  }

  try {
    target.setItem(WORKSPACE_FILE_USAGE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failures so file opens still succeed.
  }
}

function emitWorkspaceFileUsageChange(): void {
  workspaceFileUsageVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeWorkspaceFileUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readWorkspaceFileUsageVersion(): number {
  return workspaceFileUsageVersion;
}

export function readWorkspaceFileUsage(
  workspaceId: string,
  storage?: StorageLike,
): Record<string, WorkspaceFileUsageEntry> {
  return readWorkspaceFileUsageMap(storage)[workspaceId] ?? EMPTY_WORKSPACE_FILE_USAGE;
}

export function recordWorkspaceFileUsage(
  workspaceId: string,
  filePath: string,
  options?: {
    now?: number;
    storage?: StorageLike;
  },
): void {
  const normalizedPath = normalizeWorkspaceFilePath(filePath);
  if (!workspaceId || !normalizedPath) {
    return;
  }

  const now = options?.now ?? Date.now();
  const map = readWorkspaceFileUsageMap(options?.storage);
  const nextWorkspaceUsage = {
    ...map[workspaceId],
    [normalizedPath]: {
      count: (map[workspaceId]?.[normalizedPath]?.count ?? 0) + 1,
      lastOpenedAt: now,
    },
  };

  const trimmedWorkspaceUsage = Object.fromEntries(
    Object.entries(nextWorkspaceUsage)
      .sort(([, left], [, right]) => right.lastOpenedAt - left.lastOpenedAt)
      .slice(0, MAX_WORKSPACE_FILE_USAGE_ENTRIES),
  );

  writeWorkspaceFileUsageMap(
    {
      ...map,
      [workspaceId]: trimmedWorkspaceUsage,
    },
    options?.storage,
  );
  emitWorkspaceFileUsageChange();
}

export function scoreWorkspaceFileUsage(
  entry: WorkspaceFileUsageEntry | undefined,
  now: number = Date.now(),
): number {
  if (!entry) {
    return 0;
  }

  const ageHours = Math.max((now - entry.lastOpenedAt) / 3_600_000, 0);
  const recencyScore = Math.max(0, 120 - ageHours);
  const frequencyScore = Math.min(entry.count, 25) * 4;
  return recencyScore + frequencyScore;
}
