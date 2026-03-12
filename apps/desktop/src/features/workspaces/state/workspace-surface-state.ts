import type {
  GitLogEntry,
  GitPullRequestCheckSummary,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import {
  normalizeWorkspaceFilePath,
  workspaceFileBasename,
  workspaceFileExtension,
} from "../lib/workspace-file-paths";

const LAST_WORKSPACE_ID_STORAGE_KEY = "lifecycle.desktop.last-workspace-id";
const WORKSPACE_SURFACE_STATE_STORAGE_KEY = "lifecycle.desktop.workspace-surface";

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface ChangesDiffDocument {
  focusPath: string | null;
  key: string;
  kind: "changes-diff";
  label: "Changes";
}

export interface CommitDiffDocument extends GitLogEntry {
  key: string;
  kind: "commit-diff";
  label: string;
}

export interface PullRequestDocument extends GitPullRequestSummary {
  key: string;
  kind: "pull-request";
  label: string;
}

export interface FileViewerDocument {
  extension: string | null;
  filePath: string;
  key: string;
  kind: "file-viewer";
  label: string;
}

export interface LauncherTab {
  key: string;
  kind: "launcher";
  label: string;
}

export type WorkspaceSurfaceDocument =
  | ChangesDiffDocument
  | CommitDiffDocument
  | FileViewerDocument
  | PullRequestDocument
  | LauncherTab;

export interface WorkspaceSurfaceState {
  activeTabKey: string | null;
  documents: WorkspaceSurfaceDocument[];
  hiddenRuntimeTabKeys: string[];
  tabOrderKeys: string[];
  viewStateByTabKey: Record<string, WorkspaceSurfaceTabViewState>;
}

export interface WorkspaceSurfaceTabViewState {
  scrollTop: number;
}

type PersistedChangesDiffDocument = {
  focusPath?: unknown;
  kind?: unknown;
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

type PersistedFileViewerDocument = {
  filePath?: unknown;
  kind?: unknown;
};

type PersistedLauncherDocument = {
  key?: unknown;
  kind?: unknown;
};

type PersistedPullRequestDocument = {
  author?: unknown;
  baseRefName?: unknown;
  checks?: unknown;
  createdAt?: unknown;
  headRefName?: unknown;
  isDraft?: unknown;
  mergeStateStatus?: unknown;
  mergeable?: unknown;
  number?: unknown;
  reviewDecision?: unknown;
  state?: unknown;
  title?: unknown;
  kind?: unknown;
  updatedAt?: unknown;
  url?: unknown;
};

type PersistedWorkspaceState = {
  activeTabKey?: unknown;
  documents?: unknown;
  hiddenRuntimeTabKeys?: unknown;
  tabOrderKeys?: unknown;
  viewStateByTabKey?: unknown;
};

type PersistedWorkspaceStateMap = Record<string, PersistedWorkspaceState>;

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

export function changesDiffTabKey(): string {
  return "diff:changes";
}

export function commitDiffTabKey(sha: string): string {
  return `diff:commit:${sha}`;
}

export function pullRequestTabKey(pullRequestNumber: number): string {
  return `pull-request:${pullRequestNumber}`;
}

export function fileViewerTabKey(filePath: string): string {
  return `file:${normalizeWorkspaceFilePath(filePath)}`;
}

export function createChangesDiffTab(focusPath: string | null = null): ChangesDiffDocument {
  return {
    focusPath,
    key: changesDiffTabKey(),
    kind: "changes-diff",
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
    kind: "commit-diff",
    label: shortSha,
    message,
    sha,
    shortSha,
    timestamp: typeof input === "string" ? "" : (input.timestamp ?? ""),
  };
}

export function createPullRequestTab(input: GitPullRequestSummary): PullRequestDocument {
  return {
    ...input,
    key: pullRequestTabKey(input.number),
    kind: "pull-request",
    label: `PR #${input.number}`,
  };
}

export function createFileViewerTab(filePath: string): FileViewerDocument {
  const normalizedFilePath = normalizeWorkspaceFilePath(filePath);

  return {
    extension: workspaceFileExtension(normalizedFilePath),
    filePath: normalizedFilePath,
    key: fileViewerTabKey(normalizedFilePath),
    kind: "file-viewer",
    label: workspaceFileBasename(normalizedFilePath),
  };
}

export function createLauncherTab(id: string): LauncherTab {
  return {
    key: `launcher:${id}`,
    kind: "launcher",
    label: "New Tab",
  };
}

export function isChangesDiffDocument(
  document: WorkspaceSurfaceDocument,
): document is ChangesDiffDocument {
  return document.kind === "changes-diff";
}

export function isCommitDiffDocument(
  document: WorkspaceSurfaceDocument,
): document is CommitDiffDocument {
  return document.kind === "commit-diff";
}

export function isPullRequestDocument(
  document: WorkspaceSurfaceDocument,
): document is PullRequestDocument {
  return document.kind === "pull-request";
}

export function isFileViewerDocument(
  document: WorkspaceSurfaceDocument,
): document is FileViewerDocument {
  return document.kind === "file-viewer";
}

export function isLauncherDocument(document: WorkspaceSurfaceDocument): document is LauncherTab {
  return document.kind === "launcher";
}

export function createDefaultWorkspaceSurfaceState(): WorkspaceSurfaceState {
  return {
    activeTabKey: null,
    documents: [],
    hiddenRuntimeTabKeys: [],
    tabOrderKeys: [],
    viewStateByTabKey: {},
  };
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

    dedupedKeys.add(key);
  }

  return [...dedupedKeys];
}

function normalizeViewStateByTabKey(
  viewStateByTabKey: WorkspaceSurfaceState["viewStateByTabKey"],
  knownTabKeys: ReadonlySet<string>,
): WorkspaceSurfaceState["viewStateByTabKey"] {
  const normalized: WorkspaceSurfaceState["viewStateByTabKey"] = {};

  for (const [key, viewState] of Object.entries(viewStateByTabKey)) {
    if (!knownTabKeys.has(key)) {
      continue;
    }

    if (!Number.isFinite(viewState.scrollTop) || viewState.scrollTop <= 0) {
      continue;
    }

    normalized[key] = {
      scrollTop: viewState.scrollTop,
    };
  }

  return normalized;
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
  const activeTabKey = state.activeTabKey;
  const knownTabKeys = new Set([
    ...documents.map((document) => document.key),
    ...hiddenRuntimeTabKeys,
    ...tabOrderKeys,
    ...(activeTabKey ? [activeTabKey] : []),
  ]);
  const viewStateByTabKey = normalizeViewStateByTabKey(state.viewStateByTabKey, knownTabKeys);

  return {
    activeTabKey: activeTabKey && hiddenRuntimeTabKeySet.has(activeTabKey) ? null : activeTabKey,
    documents,
    hiddenRuntimeTabKeys,
    tabOrderKeys,
    viewStateByTabKey,
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

function parseChangesDiffDocument(value: Record<string, unknown>): ChangesDiffDocument {
  const focusPath = getOptionalString(value, "focusPath") ?? null;
  return createChangesDiffTab(focusPath);
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

function parseFileViewerDocument(value: Record<string, unknown>): FileViewerDocument | null {
  const filePath = getOptionalString(value, "filePath");
  if (!filePath) {
    return null;
  }

  return createFileViewerTab(filePath);
}

function parseLauncherDocument(value: Record<string, unknown>): LauncherTab | null {
  const key = getOptionalString(value, "key");
  if (!key || !key.startsWith("launcher:")) {
    return null;
  }

  return createLauncherTab(key.slice("launcher:".length));
}

function isValidPullRequestState(value: unknown): value is PullRequestDocument["state"] {
  return value === "open" || value === "closed" || value === "merged";
}

function isValidPullRequestMergeable(value: unknown): value is PullRequestDocument["mergeable"] {
  return value === "mergeable" || value === "conflicting" || value === "unknown";
}

function isValidPullRequestReviewDecision(
  value: unknown,
): value is Exclude<PullRequestDocument["reviewDecision"], null> {
  return value === "approved" || value === "changes_requested" || value === "review_required";
}

function isValidPullRequestCheckStatus(
  value: unknown,
): value is GitPullRequestCheckSummary["status"] {
  return value === "pending" || value === "success" || value === "failed" || value === "neutral";
}

function parsePullRequestChecks(value: unknown): GitPullRequestCheckSummary[] | null | undefined {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const checks: GitPullRequestCheckSummary[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }

    const name = getOptionalString(item, "name");
    const status = item.status;
    if (!name || !isValidPullRequestCheckStatus(status)) {
      return undefined;
    }

    const workflowName =
      item.workflowName === null ? null : (getOptionalString(item, "workflowName") ?? undefined);
    const detailsUrl =
      item.detailsUrl === null ? null : (getOptionalString(item, "detailsUrl") ?? undefined);
    if (workflowName === undefined || detailsUrl === undefined) {
      return undefined;
    }

    checks.push({
      detailsUrl,
      name,
      status,
      workflowName,
    });
  }

  return checks;
}

function parsePullRequestDocument(value: Record<string, unknown>): PullRequestDocument | null {
  const number = value.number;
  const title = getOptionalString(value, "title");
  const url = getOptionalString(value, "url");
  const state = value.state;
  const isDraft = value.isDraft;
  const author = getOptionalString(value, "author");
  const headRefName = getOptionalString(value, "headRefName");
  const baseRefName = getOptionalString(value, "baseRefName");
  const createdAt = getOptionalString(value, "createdAt");
  const updatedAt = getOptionalString(value, "updatedAt");
  const mergeable = value.mergeable;
  const reviewDecision = value.reviewDecision ?? null;
  const checks = parsePullRequestChecks(value.checks);

  if (
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    !title ||
    !url ||
    !isValidPullRequestState(state) ||
    typeof isDraft !== "boolean" ||
    !author ||
    !headRefName ||
    !baseRefName ||
    !createdAt ||
    !updatedAt ||
    !isValidPullRequestMergeable(mergeable) ||
    checks === undefined
  ) {
    return null;
  }

  if (reviewDecision !== null && !isValidPullRequestReviewDecision(reviewDecision)) {
    return null;
  }

  const mergeStateStatus =
    value.mergeStateStatus === null || value.mergeStateStatus === undefined
      ? null
      : (getOptionalString(value, "mergeStateStatus") ?? undefined);
  if (mergeStateStatus === undefined) {
    return null;
  }

  return createPullRequestTab({
    author,
    baseRefName,
    checks,
    createdAt,
    headRefName,
    isDraft,
    mergeStateStatus,
    mergeable,
    number,
    reviewDecision,
    state,
    title,
    updatedAt,
    url,
  });
}

function parseWorkspaceSurfaceDocument(value: unknown): WorkspaceSurfaceDocument | null {
  if (!isRecord(value)) {
    return null;
  }

  const documentKind = getOptionalString(value, "kind");
  if (!documentKind) {
    return null;
  }

  if (documentKind === "changes-diff") {
    return parseChangesDiffDocument(value as PersistedChangesDiffDocument);
  }

  if (documentKind === "commit-diff") {
    return parseCommitDiffDocument(value as PersistedCommitDiffDocument);
  }

  if (documentKind === "file-viewer") {
    return parseFileViewerDocument(value as PersistedFileViewerDocument);
  }

  if (documentKind === "pull-request") {
    return parsePullRequestDocument(value as PersistedPullRequestDocument);
  }

  if (documentKind === "launcher") {
    return parseLauncherDocument(value as PersistedLauncherDocument);
  }

  return null;
}

function parseWorkspaceSurfaceState(value: unknown): WorkspaceSurfaceState {
  if (!isRecord(value)) {
    return createDefaultWorkspaceSurfaceState();
  }

  const activeTabKey = typeof value.activeTabKey === "string" ? value.activeTabKey : null;
  const documents = Array.isArray(value.documents)
    ? normalizeDocuments(
        value.documents
          .map((document) => parseWorkspaceSurfaceDocument(document))
          .filter((document): document is WorkspaceSurfaceDocument => document !== null),
      )
    : [];

  const hiddenRuntimeTabKeys = Array.isArray(value.hiddenRuntimeTabKeys)
    ? value.hiddenRuntimeTabKeys.filter((key): key is string => typeof key === "string")
    : [];
  const tabOrderKeys = Array.isArray(value.tabOrderKeys)
    ? value.tabOrderKeys.filter((key): key is string => typeof key === "string")
    : [];
  const viewStateByTabKey = isRecord(value.viewStateByTabKey)
    ? Object.fromEntries(
        Object.entries(value.viewStateByTabKey).flatMap(([key, nextValue]) => {
          if (!isRecord(nextValue) || typeof nextValue.scrollTop !== "number") {
            return [];
          }

          return [[key, { scrollTop: nextValue.scrollTop }] as const];
        }),
      )
    : {};

  return normalizeWorkspaceSurfaceState({
    activeTabKey,
    documents,
    hiddenRuntimeTabKeys,
    tabOrderKeys,
    viewStateByTabKey,
  });
}

function readPersistedWorkspaceSurfaceStateMap(
  storage: StorageLike | null,
  key: string,
): PersistedWorkspaceStateMap | null {
  if (!storage) {
    return null;
  }

  return parseJsonObject<PersistedWorkspaceStateMap>(storage.getItem(key));
}

function serializeCommitDiffDocument(document: CommitDiffDocument): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
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

function serializePullRequestDocument(document: PullRequestDocument): Record<string, unknown> {
  return {
    author: document.author,
    baseRefName: document.baseRefName,
    checks: document.checks,
    createdAt: document.createdAt,
    headRefName: document.headRefName,
    isDraft: document.isDraft,
    mergeStateStatus: document.mergeStateStatus,
    mergeable: document.mergeable,
    number: document.number,
    reviewDecision: document.reviewDecision,
    state: document.state,
    title: document.title,
    kind: document.kind,
    updatedAt: document.updatedAt,
    url: document.url,
  };
}

function serializeWorkspaceSurfaceDocument(
  document: WorkspaceSurfaceDocument,
): Record<string, unknown> {
  if (isChangesDiffDocument(document)) {
    return document.focusPath === null
      ? { kind: document.kind }
      : {
          focusPath: document.focusPath,
          kind: document.kind,
        };
  }

  if (isLauncherDocument(document)) {
    return {
      key: document.key,
      kind: document.kind,
    };
  }

  if (isFileViewerDocument(document)) {
    return {
      filePath: document.filePath,
      kind: document.kind,
    };
  }

  if (isPullRequestDocument(document)) {
    return serializePullRequestDocument(document);
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

  if (Object.keys(normalizedState.viewStateByTabKey).length > 0) {
    serializedState.viewStateByTabKey = normalizedState.viewStateByTabKey;
  }

  return serializedState;
}

export function readWorkspaceSurfaceState(
  workspaceId: string,
  storage?: StorageLike,
): WorkspaceSurfaceState {
  const resolvedStorage = getStorage(storage);
  const persistedMap = readPersistedWorkspaceSurfaceStateMap(
    resolvedStorage,
    WORKSPACE_SURFACE_STATE_STORAGE_KEY,
  );

  if (persistedMap && workspaceId in persistedMap) {
    return parseWorkspaceSurfaceState(persistedMap[workspaceId]);
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
    readPersistedWorkspaceSurfaceStateMap(resolvedStorage, WORKSPACE_SURFACE_STATE_STORAGE_KEY) ??
    {};
  const nextMap: PersistedWorkspaceStateMap = { ...persistedMap };
  const normalizedState = normalizeWorkspaceSurfaceState(state);

  if (
    normalizedState.documents.length === 0 &&
    normalizedState.activeTabKey === null &&
    normalizedState.hiddenRuntimeTabKeys.length === 0 &&
    normalizedState.tabOrderKeys.length === 0 &&
    Object.keys(normalizedState.viewStateByTabKey).length === 0
  ) {
    delete nextMap[workspaceId];
  } else {
    nextMap[workspaceId] = serializeWorkspaceSurfaceState(normalizedState);
  }

  if (Object.keys(nextMap).length === 0) {
    resolvedStorage.removeItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY);
  } else {
    resolvedStorage.setItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY, JSON.stringify(nextMap));
  }
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
