import { normalizeWorkspaceFilePath } from "@/features/workspaces/lib/workspace-file-paths";

const WORKSPACE_EXPLORER_USAGE_STORAGE_KEY = "lifecycle.desktop.workspace-explorer-usage";
const MAX_WORKSPACE_EXPLORER_USAGE_ENTRIES = 200;
const EMPTY_WORKSPACE_EXPLORER_USAGE: Record<string, WorkspaceExplorerUsageEntry> = {};

export interface WorkspaceExplorerUsageEntry {
  count: number;
  lastOpenedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type WorkspaceExplorerUsageMap = Record<string, Record<string, WorkspaceExplorerUsageEntry>>;

const listeners = new Set<() => void>();
let workspaceExplorerUsageVersion = 0;

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

function isWorkspaceExplorerUsageEntry(value: unknown): value is WorkspaceExplorerUsageEntry {
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

function readWorkspaceExplorerUsageMap(storage?: StorageLike): WorkspaceExplorerUsageMap {
  const target = getStorage(storage);
  if (!target) {
    return {};
  }

  try {
    const raw = target.getItem(WORKSPACE_EXPLORER_USAGE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }

    const workspaceUsageEntries: Array<[string, Record<string, WorkspaceExplorerUsageEntry>]> = [];

    for (const [workspaceId, value] of Object.entries(parsed)) {
      const workspaceUsage: Record<string, WorkspaceExplorerUsageEntry> = {};

      if (isRecord(value)) {
        for (const [filePath, entry] of Object.entries(value)) {
          if (isWorkspaceExplorerUsageEntry(entry)) {
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

function writeWorkspaceExplorerUsageMap(map: WorkspaceExplorerUsageMap, storage?: StorageLike): void {
  const target = getStorage(storage);
  if (!target) {
    return;
  }

  try {
    target.setItem(WORKSPACE_EXPLORER_USAGE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failures so file opens still succeed.
  }
}

function emitWorkspaceExplorerUsageChange(): void {
  workspaceExplorerUsageVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeWorkspaceExplorerUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readWorkspaceExplorerUsageVersion(): number {
  return workspaceExplorerUsageVersion;
}

export function readWorkspaceExplorerUsage(
  workspaceId: string,
  storage?: StorageLike,
): Record<string, WorkspaceExplorerUsageEntry> {
  return readWorkspaceExplorerUsageMap(storage)[workspaceId] ?? EMPTY_WORKSPACE_EXPLORER_USAGE;
}

export function recordWorkspaceExplorerUsage(
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
  const map = readWorkspaceExplorerUsageMap(options?.storage);
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
      .slice(0, MAX_WORKSPACE_EXPLORER_USAGE_ENTRIES),
  );

  writeWorkspaceExplorerUsageMap(
    {
      ...map,
      [workspaceId]: trimmedWorkspaceUsage,
    },
    options?.storage,
  );
  emitWorkspaceExplorerUsageChange();
}

export function scoreWorkspaceExplorerUsage(
  entry: WorkspaceExplorerUsageEntry | undefined,
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
