import type { GitLogEntry } from "@lifecycle/contracts";

const LAST_WORKSPACE_ID_STORAGE_KEY = "lifecycle.desktop.last-workspace-id";
const WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1 = "lifecycle.desktop.workspace-surface.v1";
const WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2 = "lifecycle.desktop.workspace-surface.v2";

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface ChangesDiffDocument {
  focusPath: string | null;
  key: string;
  type: "changes-diff";
  label: "Changes";
}

export interface CommitDiffDocument extends GitLogEntry {
  key: string;
  type: "commit-diff";
  label: string;
}

export interface LauncherTab {
  key: string;
  type: "launcher";
  label: string;
}

export type WorkspaceSurfaceDocument = ChangesDiffDocument | CommitDiffDocument | LauncherTab;

export interface WorkspaceSurfaceState {
  activeTabKey: string | null;
  documents: WorkspaceSurfaceDocument[];
  hiddenRuntimeTabKeys: string[];
  tabOrderKeys: string[];
}

type PersistedV1Document = {
  filePath?: unknown;
  scope?: unknown;
};

type PersistedV1WorkspaceState = {
  activeTabKey?: unknown;
  documents?: unknown;
};

type PersistedChangesDiffDocument = {
  focusPath?: unknown;
  type?: unknown;
  kind?: unknown;
};

type PersistedFileDiffDocument = {
  filePath?: unknown;
  type?: unknown;
  kind?: unknown;
};

type PersistedCommitDiffDocument = {
  author?: unknown;
  email?: unknown;
  type?: unknown;
  kind?: unknown;
  message?: unknown;
  sha?: unknown;
  shortSha?: unknown;
  timestamp?: unknown;
};

type PersistedLauncherDocument = {
  key?: unknown;
  type?: unknown;
  kind?: unknown;
};

type PersistedLegacyDiffDocument = {
  diffKind?: unknown;
  filePath?: unknown;
  type?: unknown;
  kind?: unknown;
  sha?: unknown;
  message?: unknown;
  shortSha?: unknown;
  timestamp?: unknown;
};

type PersistedWorkspaceState = {
  activeTabKey?: unknown;
  documents?: unknown;
  hiddenRuntimeTabKeys?: unknown;
  tabOrderKeys?: unknown;
};

type PersistedWorkspaceStateMap = Record<string, PersistedWorkspaceState>;
type PersistedWorkspaceStateMapV1 = Record<string, PersistedV1WorkspaceState>;

type CommitDiffInput =
  | GitLogEntry
  | {
      author?: string;
      email?: string;
      message?: string;
      sha: string;
      shortSha?: string;
      timestamp?: string;
    };

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

function getOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function defaultCommitMessage(shortSha: string): string {
  return `Commit ${shortSha}`;
}

export function isRuntimeTabKey(value: string): boolean {
  return value.startsWith("terminal:");
}

function shortShaFromSha(sha: string): string {
  return sha.slice(0, 8);
}

function extractLegacyFileDiffFocusPath(tabKey: string | null): string | null {
  if (!tabKey) {
    return null;
  }

  const legacyDiffMatch = /^diff:(working|staged|branch):(.*)$/.exec(tabKey);
  if (legacyDiffMatch) {
    return legacyDiffMatch[2] ?? null;
  }

  if (tabKey.startsWith("file-diff:")) {
    return tabKey.slice("file-diff:".length);
  }

  if (tabKey.startsWith("diff:file:")) {
    return tabKey.slice("diff:file:".length);
  }

  return null;
}

export function changesDiffTabKey(): string {
  return "diff:changes";
}

export const changesDiffTabKeyV2 = changesDiffTabKey();

export function commitDiffTabKey(sha: string): string {
  return `diff:commit:${sha}`;
}

export const commitDiffTabKeyV2 = commitDiffTabKey;

export function createChangesDiffTab(focusPath: string | null = null): ChangesDiffDocument {
  return {
    focusPath,
    key: changesDiffTabKey(),
    type: "changes-diff",
    label: "Changes",
  };
}

export function createCommitDiffTab(input: CommitDiffInput | string): CommitDiffDocument {
  const sha = typeof input === "string" ? input : input.sha;
  const shortSha =
    typeof input === "string" ? shortShaFromSha(sha) : (input.shortSha ?? shortShaFromSha(sha));
  const message =
    typeof input === "string"
      ? defaultCommitMessage(shortSha)
      : (input.message ?? defaultCommitMessage(shortSha));

  return {
    author: typeof input === "string" ? "" : (input.author ?? ""),
    email: typeof input === "string" ? "" : (input.email ?? ""),
    key: commitDiffTabKey(sha),
    type: "commit-diff",
    label: shortSha,
    message,
    sha,
    shortSha,
    timestamp: typeof input === "string" ? "" : (input.timestamp ?? ""),
  };
}

export function createLauncherTab(id: string): LauncherTab {
  return {
    key: `launcher:${id}`,
    type: "launcher",
    label: "New Tab",
  };
}

export function isChangesDiffDocument(
  document: WorkspaceSurfaceDocument,
): document is ChangesDiffDocument {
  return document.type === "changes-diff";
}

export function isCommitDiffDocument(
  document: WorkspaceSurfaceDocument,
): document is CommitDiffDocument {
  return document.type === "commit-diff";
}

export function isLauncherDocument(document: WorkspaceSurfaceDocument): document is LauncherTab {
  return document.type === "launcher";
}

export function createDefaultWorkspaceSurfaceState(): WorkspaceSurfaceState {
  return {
    activeTabKey: null,
    documents: [],
    hiddenRuntimeTabKeys: [],
    tabOrderKeys: [],
  };
}

export function migrateLegacyTabKeyToV2(tabKey: string | null): string | null {
  if (!tabKey) {
    return null;
  }

  if (extractLegacyFileDiffFocusPath(tabKey) !== null || tabKey === changesDiffTabKey()) {
    return changesDiffTabKey();
  }

  if (tabKey.startsWith("commit-diff:")) {
    return commitDiffTabKey(tabKey.slice("commit-diff:".length));
  }

  return tabKey;
}

function normalizeDocuments(documents: WorkspaceSurfaceDocument[]): WorkspaceSurfaceDocument[] {
  const dedupedDocuments = new Map<string, WorkspaceSurfaceDocument>();

  for (const document of documents) {
    dedupedDocuments.set(document.key, document);
  }

  return [...dedupedDocuments.values()];
}

function normalizeTabKeyList(keys: readonly string[]): string[] {
  const dedupedKeys = new Set<string>();

  for (const key of keys) {
    if (typeof key !== "string" || key.length === 0) {
      continue;
    }

    const migratedKey = migrateLegacyTabKeyToV2(key);
    if (migratedKey) {
      dedupedKeys.add(migratedKey);
    }
  }

  return [...dedupedKeys];
}

function normalizeWorkspaceSurfaceState(state: WorkspaceSurfaceState): WorkspaceSurfaceState {
  const documents = normalizeDocuments(state.documents);
  const hiddenRuntimeTabKeys = normalizeTabKeyList(state.hiddenRuntimeTabKeys).filter(
    isRuntimeTabKey,
  );
  const hiddenRuntimeTabKeySet = new Set(hiddenRuntimeTabKeys);
  const tabOrderKeys = normalizeTabKeyList(state.tabOrderKeys).filter(
    (key) => !hiddenRuntimeTabKeySet.has(key),
  );
  const activeTabKey = migrateLegacyTabKeyToV2(state.activeTabKey);

  return {
    activeTabKey: activeTabKey && hiddenRuntimeTabKeySet.has(activeTabKey) ? null : activeTabKey,
    documents,
    hiddenRuntimeTabKeys,
    tabOrderKeys,
  };
}

function parseJsonObject<T extends Record<string, unknown>>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

interface LegacyFileDiffDocument {
  filePath: string;
  type: "legacy-file-diff";
}

type ParsedWorkspaceSurfaceDocument = WorkspaceSurfaceDocument | LegacyFileDiffDocument;

function parseChangesDiffDocument(value: Record<string, unknown>): ChangesDiffDocument {
  const focusPath = getOptionalString(value, "focusPath") ?? null;
  return createChangesDiffTab(focusPath);
}

function parseFileDiffDocument(value: Record<string, unknown>): LegacyFileDiffDocument | null {
  const filePath = getOptionalString(value, "filePath");
  if (!filePath) {
    return null;
  }

  return {
    filePath,
    type: "legacy-file-diff",
  };
}

function parseCommitDiffDocument(value: Record<string, unknown>): CommitDiffDocument | null {
  const sha = getOptionalString(value, "sha");
  if (!sha) {
    return null;
  }

  for (const field of ["author", "email", "message", "shortSha", "timestamp"] as const) {
    if (field in value && value[field] !== undefined && typeof value[field] !== "string") {
      return null;
    }
  }

  return createCommitDiffTab({
    author: getOptionalString(value, "author"),
    email: getOptionalString(value, "email"),
    message: getOptionalString(value, "message"),
    sha,
    shortSha: getOptionalString(value, "shortSha"),
    timestamp: getOptionalString(value, "timestamp"),
  });
}

function parseLauncherDocument(value: Record<string, unknown>): LauncherTab | null {
  const key = getOptionalString(value, "key");
  if (!key || !key.startsWith("launcher:")) {
    return null;
  }

  return createLauncherTab(key.slice("launcher:".length));
}

function getPersistedDocumentType(value: Record<string, unknown>): string | null {
  if (typeof value.type === "string") {
    return value.type;
  }

  if (typeof value.kind === "string") {
    return value.kind;
  }

  return null;
}

function parseWorkspaceSurfaceDocument(value: unknown): ParsedWorkspaceSurfaceDocument | null {
  if (!isRecord(value)) {
    return null;
  }

  const documentType = getPersistedDocumentType(value);

  if (documentType === "changes-diff") {
    return parseChangesDiffDocument(value as PersistedChangesDiffDocument);
  }

  if (documentType === "file-diff") {
    return parseFileDiffDocument(value as PersistedFileDiffDocument);
  }

  if (documentType === "commit-diff") {
    return parseCommitDiffDocument(value as PersistedCommitDiffDocument);
  }

  if (documentType === "launcher") {
    return parseLauncherDocument(value as PersistedLauncherDocument);
  }

  if (documentType === "diff" && value.diffKind === "file") {
    return parseFileDiffDocument(value as PersistedLegacyDiffDocument);
  }

  if (documentType === "diff" && value.diffKind === "commit") {
    return parseCommitDiffDocument(value as PersistedLegacyDiffDocument);
  }

  if ("filePath" in value && "scope" in value) {
    return parseFileDiffDocument(value as PersistedV1Document);
  }

  return null;
}

function collapsePersistedDocuments(
  documents: ParsedWorkspaceSurfaceDocument[],
  activeTabKey: string | null,
): WorkspaceSurfaceDocument[] {
  const collapsedDocuments: WorkspaceSurfaceDocument[] = [];
  const activeLegacyFocusPath = extractLegacyFileDiffFocusPath(activeTabKey);
  const activeChangesTab = migrateLegacyTabKeyToV2(activeTabKey) === changesDiffTabKey();
  let diffInsertIndex: number | null = null;
  let migratedFocusPath: string | null = activeLegacyFocusPath;
  let fallbackFocusPath: string | null = null;

  for (const document of documents) {
    if (document.type === "legacy-file-diff") {
      fallbackFocusPath ??= document.filePath;
      if (activeLegacyFocusPath === document.filePath) {
        migratedFocusPath = document.filePath;
      }
      diffInsertIndex ??= collapsedDocuments.length;
      continue;
    }

    if (isChangesDiffDocument(document)) {
      fallbackFocusPath ??= document.focusPath;
      if (activeChangesTab && migratedFocusPath === null && document.focusPath !== null) {
        migratedFocusPath = document.focusPath;
      }
      diffInsertIndex ??= collapsedDocuments.length;
      continue;
    }

    collapsedDocuments.push(document);
  }

  if (diffInsertIndex !== null || activeChangesTab) {
    collapsedDocuments.splice(
      diffInsertIndex ?? collapsedDocuments.length,
      0,
      createChangesDiffTab(migratedFocusPath ?? fallbackFocusPath ?? null),
    );
  }

  return normalizeDocuments(collapsedDocuments);
}

function parseWorkspaceSurfaceState(value: unknown): WorkspaceSurfaceState {
  if (!isRecord(value)) {
    return createDefaultWorkspaceSurfaceState();
  }

  const activeTabKey = typeof value.activeTabKey === "string" ? value.activeTabKey : null;
  const documents = Array.isArray(value.documents)
    ? collapsePersistedDocuments(
        value.documents
          .map((document) => parseWorkspaceSurfaceDocument(document))
          .filter((document): document is ParsedWorkspaceSurfaceDocument => document !== null),
        activeTabKey,
      )
    : [];

  const hiddenRuntimeTabKeys = Array.isArray(value.hiddenRuntimeTabKeys)
    ? value.hiddenRuntimeTabKeys.filter((key): key is string => typeof key === "string")
    : [];
  const tabOrderKeys = Array.isArray(value.tabOrderKeys)
    ? value.tabOrderKeys.filter((key): key is string => typeof key === "string")
    : [];

  return normalizeWorkspaceSurfaceState({
    activeTabKey,
    documents,
    hiddenRuntimeTabKeys,
    tabOrderKeys,
  });
}

function readPersistedWorkspaceSurfaceStateMap(
  storage: StorageLike | null,
  key: string,
): PersistedWorkspaceStateMap | PersistedWorkspaceStateMapV1 | null {
  if (!storage) {
    return null;
  }

  return parseJsonObject<PersistedWorkspaceStateMap | PersistedWorkspaceStateMapV1>(
    storage.getItem(key),
  );
}

function serializeCommitDiffDocument(document: CommitDiffDocument): Record<string, string> {
  const serialized: Record<string, string> = {
    type: "commit-diff",
    sha: document.sha,
    shortSha: document.shortSha,
  };

  if (document.message !== defaultCommitMessage(document.shortSha)) {
    serialized.message = document.message;
  }

  if (document.author) {
    serialized.author = document.author;
  }

  if (document.email) {
    serialized.email = document.email;
  }

  if (document.timestamp) {
    serialized.timestamp = document.timestamp;
  }

  return serialized;
}

function serializeWorkspaceSurfaceDocument(
  document: WorkspaceSurfaceDocument,
): Record<string, string> {
  if (isChangesDiffDocument(document)) {
    return document.focusPath === null
      ? { type: document.type }
      : {
          focusPath: document.focusPath,
          type: document.type,
        };
  }

  if (isLauncherDocument(document)) {
    return {
      key: document.key,
      type: document.type,
    };
  }

  return serializeCommitDiffDocument(document);
}

function serializeWorkspaceSurfaceState(state: WorkspaceSurfaceState): PersistedWorkspaceState {
  const normalizedState = normalizeWorkspaceSurfaceState(state);

  const serializedState: PersistedWorkspaceState = {
    activeTabKey: normalizedState.activeTabKey,
    documents: normalizedState.documents.map((document) =>
      serializeWorkspaceSurfaceDocument(document),
    ),
  };

  if (normalizedState.tabOrderKeys.length > 0) {
    serializedState.tabOrderKeys = normalizedState.tabOrderKeys;
  }

  if (normalizedState.hiddenRuntimeTabKeys.length > 0) {
    serializedState.hiddenRuntimeTabKeys = normalizedState.hiddenRuntimeTabKeys;
  }

  return serializedState;
}

export function readWorkspaceSurfaceState(
  workspaceId: string,
  storage?: StorageLike,
): WorkspaceSurfaceState {
  const resolvedStorage = getStorage(storage);
  const persistedV2 = readPersistedWorkspaceSurfaceStateMap(
    resolvedStorage,
    WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2,
  );

  if (persistedV2 && workspaceId in persistedV2) {
    return parseWorkspaceSurfaceState(persistedV2[workspaceId]);
  }

  const persistedV1 = readPersistedWorkspaceSurfaceStateMap(
    resolvedStorage,
    WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1,
  );

  if (persistedV1 && workspaceId in persistedV1) {
    return parseWorkspaceSurfaceState(persistedV1[workspaceId]);
  }

  return createDefaultWorkspaceSurfaceState();
}

export function writeWorkspaceSurfaceState(
  workspaceId: string,
  state: WorkspaceSurfaceState,
  storage?: StorageLike,
): void {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  const persistedMap =
    readPersistedWorkspaceSurfaceStateMap(
      resolvedStorage,
      WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2,
    ) ?? {};
  const nextMap: PersistedWorkspaceStateMap = { ...persistedMap };
  const normalizedState = normalizeWorkspaceSurfaceState(state);

  if (
    normalizedState.documents.length === 0 &&
    normalizedState.activeTabKey === null &&
    normalizedState.hiddenRuntimeTabKeys.length === 0 &&
    normalizedState.tabOrderKeys.length === 0
  ) {
    delete nextMap[workspaceId];
  } else {
    nextMap[workspaceId] = serializeWorkspaceSurfaceState(normalizedState);
  }

  if (Object.keys(nextMap).length === 0) {
    resolvedStorage.removeItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2);
  } else {
    resolvedStorage.setItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2, JSON.stringify(nextMap));
  }

  resolvedStorage.removeItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1);
}

export function readLastWorkspaceId(storage?: StorageLike): string | null {
  return getStorage(storage)?.getItem(LAST_WORKSPACE_ID_STORAGE_KEY) ?? null;
}

export function writeLastWorkspaceId(workspaceId: string, storage?: StorageLike): void {
  getStorage(storage)?.setItem(LAST_WORKSPACE_ID_STORAGE_KEY, workspaceId);
}

export function clearLastWorkspaceId(storage?: StorageLike): void {
  getStorage(storage)?.removeItem(LAST_WORKSPACE_ID_STORAGE_KEY);
}
