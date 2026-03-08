import type { GitDiffScope, GitLogEntry } from "@lifecycle/contracts";

const LAST_WORKSPACE_ID_STORAGE_KEY = "lifecycle.desktop.last-workspace-id";
const WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1 = "lifecycle.desktop.workspace-surface.v1";
const WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2 = "lifecycle.desktop.workspace-surface.v2";

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface FileDiffDocument {
  activeScope: GitDiffScope;
  filePath: string;
  initialScope: GitDiffScope;
  key: string;
  kind: "file-diff";
  label: string;
}

export interface CommitDiffDocument extends GitLogEntry {
  key: string;
  kind: "commit-diff";
  label: string;
}

export type WorkspaceSurfaceDocument = FileDiffDocument | CommitDiffDocument;

export interface WorkspaceSurfaceState {
  activeTabKey: string | null;
  documents: WorkspaceSurfaceDocument[];
}

type PersistedV1Document = {
  filePath?: unknown;
  scope?: unknown;
};

type PersistedV1WorkspaceState = {
  activeTabKey?: unknown;
  documents?: unknown;
};

type PersistedFileDiffDocument = {
  activeScope?: unknown;
  filePath?: unknown;
  initialScope?: unknown;
  kind?: unknown;
  scope?: unknown;
};

type PersistedCommitDiffDocument = {
  author?: unknown;
  email?: unknown;
  kind?: unknown;
  message?: unknown;
  sha?: unknown;
  shortSha?: unknown;
  timestamp?: unknown;
};

type PersistedLegacyDiffDocument = {
  activeScope?: unknown;
  diffKind?: unknown;
  filePath?: unknown;
  initialScope?: unknown;
  kind?: unknown;
  message?: unknown;
  scope?: unknown;
  sha?: unknown;
  shortSha?: unknown;
  timestamp?: unknown;
};

type PersistedWorkspaceState = {
  activeTabKey?: unknown;
  documents?: unknown;
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

function getBasename(filePath: string): string {
  const segments = filePath.split(/[\\/]/);
  const basename = segments.at(-1);
  return basename && basename.length > 0 ? basename : filePath;
}

function defaultCommitMessage(shortSha: string): string {
  return `Commit ${shortSha}`;
}

function shortShaFromSha(sha: string): string {
  return sha.slice(0, 8);
}

export function isGitDiffScope(value: unknown): value is GitDiffScope {
  return value === "working" || value === "staged" || value === "branch";
}

export function fileDiffTabKey(filePath: string): string {
  return `diff:file:${filePath}`;
}

export const fileDiffTabKeyV2 = fileDiffTabKey;

export function commitDiffTabKey(sha: string): string {
  return `diff:commit:${sha}`;
}

export const commitDiffTabKeyV2 = commitDiffTabKey;

export function createFileDiffTab(
  filePath: string,
  initialScope: GitDiffScope,
  activeScope: GitDiffScope = initialScope,
): FileDiffDocument {
  return {
    activeScope,
    filePath,
    initialScope,
    key: fileDiffTabKey(filePath),
    kind: "file-diff",
    label: getBasename(filePath),
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
    kind: "commit-diff",
    label: shortSha,
    message,
    sha,
    shortSha,
    timestamp: typeof input === "string" ? "" : (input.timestamp ?? ""),
  };
}

export function isFileDiffDocument(
  document: WorkspaceSurfaceDocument,
): document is FileDiffDocument {
  return document.kind === "file-diff";
}

export function isCommitDiffDocument(
  document: WorkspaceSurfaceDocument,
): document is CommitDiffDocument {
  return document.kind === "commit-diff";
}

export function createDefaultWorkspaceSurfaceState(): WorkspaceSurfaceState {
  return {
    activeTabKey: null,
    documents: [],
  };
}

export function migrateLegacyActiveTabKeyToV2(activeTabKey: string | null): string | null {
  if (!activeTabKey) {
    return null;
  }

  const legacyDiffMatch = /^diff:(working|staged|branch):(.*)$/.exec(activeTabKey);
  if (legacyDiffMatch) {
    return fileDiffTabKey(legacyDiffMatch[2] ?? "");
  }

  if (activeTabKey.startsWith("file-diff:")) {
    return fileDiffTabKey(activeTabKey.slice("file-diff:".length));
  }

  if (activeTabKey.startsWith("commit-diff:")) {
    return commitDiffTabKey(activeTabKey.slice("commit-diff:".length));
  }

  return activeTabKey;
}

function normalizeDocuments(documents: WorkspaceSurfaceDocument[]): WorkspaceSurfaceDocument[] {
  const dedupedDocuments = new Map<string, WorkspaceSurfaceDocument>();

  for (const document of documents) {
    dedupedDocuments.set(document.key, document);
  }

  return [...dedupedDocuments.values()];
}

function normalizeWorkspaceSurfaceState(state: WorkspaceSurfaceState): WorkspaceSurfaceState {
  const documents = normalizeDocuments(state.documents);
  const activeTabKey = migrateLegacyActiveTabKeyToV2(state.activeTabKey);

  return {
    activeTabKey,
    documents,
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

function parseFileDiffDocument(value: Record<string, unknown>): FileDiffDocument | null {
  const filePath = getOptionalString(value, "filePath");
  if (!filePath) {
    return null;
  }

  const initialScope = isGitDiffScope(value.initialScope)
    ? value.initialScope
    : isGitDiffScope(value.scope)
      ? value.scope
      : null;
  if (!initialScope) {
    return null;
  }

  const activeScope = isGitDiffScope(value.activeScope) ? value.activeScope : initialScope;
  return createFileDiffTab(filePath, initialScope, activeScope);
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

function parseWorkspaceSurfaceDocument(value: unknown): WorkspaceSurfaceDocument | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === "file-diff") {
    return parseFileDiffDocument(value as PersistedFileDiffDocument);
  }

  if (value.kind === "commit-diff") {
    return parseCommitDiffDocument(value as PersistedCommitDiffDocument);
  }

  if (value.kind === "diff" && value.diffKind === "file") {
    return parseFileDiffDocument(value as PersistedLegacyDiffDocument);
  }

  if (value.kind === "diff" && value.diffKind === "commit") {
    return parseCommitDiffDocument(value as PersistedLegacyDiffDocument);
  }

  if ("filePath" in value && "scope" in value) {
    return parseFileDiffDocument(value as PersistedV1Document);
  }

  return null;
}

function parseWorkspaceSurfaceState(value: unknown): WorkspaceSurfaceState {
  if (!isRecord(value)) {
    return createDefaultWorkspaceSurfaceState();
  }

  const documents = Array.isArray(value.documents)
    ? normalizeDocuments(
        value.documents
          .map((document) => parseWorkspaceSurfaceDocument(document))
          .filter((document): document is WorkspaceSurfaceDocument => document !== null),
      )
    : [];

  const activeTabKey =
    typeof value.activeTabKey === "string"
      ? migrateLegacyActiveTabKeyToV2(value.activeTabKey)
      : null;

  return {
    activeTabKey,
    documents,
  };
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
    kind: "commit-diff",
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
  if (isFileDiffDocument(document)) {
    return {
      activeScope: document.activeScope,
      filePath: document.filePath,
      initialScope: document.initialScope,
      kind: document.kind,
    };
  }

  return serializeCommitDiffDocument(document);
}

function serializeWorkspaceSurfaceState(state: WorkspaceSurfaceState): PersistedWorkspaceState {
  const normalizedState = normalizeWorkspaceSurfaceState(state);

  return {
    activeTabKey: normalizedState.activeTabKey,
    documents: normalizedState.documents.map((document) =>
      serializeWorkspaceSurfaceDocument(document),
    ),
  };
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

  if (normalizedState.documents.length === 0 && normalizedState.activeTabKey === null) {
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
