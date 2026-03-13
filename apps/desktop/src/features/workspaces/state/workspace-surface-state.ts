import type {
  GitLogEntry,
  GitPullRequestCheckSummary,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import type { FileViewerMode } from "../../files/lib/file-view-mode";
import {
  DEFAULT_WORKSPACE_PANE_ID,
  collectWorkspacePaneLeaves,
  createWorkspacePane,
  getFirstWorkspacePane,
  isWorkspacePaneLeaf,
} from "../lib/workspace-surface-panes";
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

export interface WorkspacePaneLeaf {
  activeTabKey: string | null;
  id: string;
  kind: "leaf";
  tabOrderKeys: string[];
}

export interface WorkspacePaneSplit {
  direction: "column" | "row";
  first: WorkspacePaneNode;
  id: string;
  kind: "split";
  ratio: number;
  second: WorkspacePaneNode;
}

export type WorkspacePaneNode = WorkspacePaneLeaf | WorkspacePaneSplit;

export interface WorkspaceSurfaceState {
  activePaneId: string | null;
  documents: WorkspaceSurfaceDocument[];
  hiddenRuntimeTabKeys: string[];
  rootPane: WorkspacePaneNode;
  viewStateByTabKey: Record<string, WorkspaceSurfaceTabViewState>;
}

export interface WorkspaceSurfaceTabViewState {
  fileMode?: FileViewerMode;
  scrollTop?: number;
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
  activePaneId?: unknown;
  activeTabKey?: unknown;
  documents?: unknown;
  hiddenRuntimeTabKeys?: unknown;
  rootPane?: unknown;
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
    activePaneId: DEFAULT_WORKSPACE_PANE_ID,
    documents: [],
    hiddenRuntimeTabKeys: [],
    rootPane: createWorkspacePane(),
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

function normalizeWorkspacePaneNode(
  node: WorkspacePaneNode,
  hiddenRuntimeTabKeySet: ReadonlySet<string>,
  seenNodeIds: Set<string>,
  seenTabKeys: Set<string>,
  path: string,
): WorkspacePaneNode {
  if (isWorkspacePaneLeaf(node)) {
    const fallbackId = path === "root" ? DEFAULT_WORKSPACE_PANE_ID : `pane-${path}`;
    const id =
      typeof node.id === "string" && node.id.length > 0 && !seenNodeIds.has(node.id)
        ? node.id
        : fallbackId;
    seenNodeIds.add(id);

    const tabOrderKeys: string[] = [];
    for (const key of normalizeTabKeyList(node.tabOrderKeys)) {
      if (hiddenRuntimeTabKeySet.has(key) || seenTabKeys.has(key)) {
        continue;
      }

      seenTabKeys.add(key);
      tabOrderKeys.push(key);
    }

    const requestedActiveTabKey =
      typeof node.activeTabKey === "string" &&
      node.activeTabKey.length > 0 &&
      !hiddenRuntimeTabKeySet.has(node.activeTabKey)
        ? node.activeTabKey
        : null;
    let activeTabKey =
      requestedActiveTabKey && tabOrderKeys.includes(requestedActiveTabKey)
        ? requestedActiveTabKey
        : null;

    if (requestedActiveTabKey && activeTabKey === null && !seenTabKeys.has(requestedActiveTabKey)) {
      seenTabKeys.add(requestedActiveTabKey);
      tabOrderKeys.push(requestedActiveTabKey);
      activeTabKey = requestedActiveTabKey;
    }

    return {
      activeTabKey,
      id,
      kind: "leaf",
      tabOrderKeys,
    };
  }

  const fallbackId = `split-${path}`;
  const id =
    typeof node.id === "string" && node.id.length > 0 && !seenNodeIds.has(node.id)
      ? node.id
      : fallbackId;
  seenNodeIds.add(id);

  return {
    direction: node.direction === "column" ? "column" : "row",
    first: normalizeWorkspacePaneNode(
      node.first,
      hiddenRuntimeTabKeySet,
      seenNodeIds,
      seenTabKeys,
      `${path}-first`,
    ),
    id,
    kind: "split",
    ratio:
      typeof node.ratio === "number" &&
      Number.isFinite(node.ratio) &&
      node.ratio > 0 &&
      node.ratio < 1
        ? node.ratio
        : 0.5,
    second: normalizeWorkspacePaneNode(
      node.second,
      hiddenRuntimeTabKeySet,
      seenNodeIds,
      seenTabKeys,
      `${path}-second`,
    ),
  };
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

    const nextViewState: WorkspaceSurfaceTabViewState = {};

    if (viewState.fileMode === "view" || viewState.fileMode === "edit") {
      nextViewState.fileMode = viewState.fileMode;
    }

    if (Number.isFinite(viewState.scrollTop) && (viewState.scrollTop ?? 0) > 0) {
      nextViewState.scrollTop = viewState.scrollTop;
    }

    if (nextViewState.fileMode || typeof nextViewState.scrollTop === "number") {
      normalized[key] = nextViewState;
    }
  }

  return normalized;
}

function normalizeWorkspaceSurfaceState(state: WorkspaceSurfaceState): WorkspaceSurfaceState {
  const documents = normalizeDocuments(state.documents);
  const hiddenRuntimeTabKeys = normalizeTabKeyList(state.hiddenRuntimeTabKeys).filter(
    isRuntimeTabKey,
  );
  const hiddenRuntimeTabKeySet = new Set(hiddenRuntimeTabKeys);
  const rootPane = normalizeWorkspacePaneNode(
    state.rootPane,
    hiddenRuntimeTabKeySet,
    new Set<string>(),
    new Set<string>(),
    "root",
  );
  const paneLeaves = collectWorkspacePaneLeaves(rootPane);
  const activePaneId =
    state.activePaneId && paneLeaves.some((pane) => pane.id === state.activePaneId)
      ? state.activePaneId
      : getFirstWorkspacePane(rootPane).id;
  const knownTabKeys = new Set([
    ...documents.map((document) => document.key),
    ...hiddenRuntimeTabKeys,
    ...paneLeaves.flatMap((pane) => pane.tabOrderKeys),
    ...paneLeaves.flatMap((pane) => (pane.activeTabKey ? [pane.activeTabKey] : [])),
  ]);
  const viewStateByTabKey = normalizeViewStateByTabKey(state.viewStateByTabKey, knownTabKeys);

  return {
    activePaneId,
    documents,
    hiddenRuntimeTabKeys,
    rootPane,
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

function parseWorkspacePaneNode(value: unknown, fallbackPath: string): WorkspacePaneNode | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = getOptionalString(value, "kind");
  if (kind === "leaf") {
    return {
      activeTabKey: getOptionalString(value, "activeTabKey") ?? null,
      id: getOptionalString(value, "id") ?? `pane-${fallbackPath}`,
      kind: "leaf",
      tabOrderKeys: Array.isArray(value.tabOrderKeys)
        ? value.tabOrderKeys.filter((key): key is string => typeof key === "string")
        : [],
    };
  }

  if (kind === "split") {
    const first = parseWorkspacePaneNode(value.first, `${fallbackPath}-first`);
    const second = parseWorkspacePaneNode(value.second, `${fallbackPath}-second`);
    if (!first || !second) {
      return null;
    }

    return {
      direction: value.direction === "column" ? "column" : "row",
      first,
      id: getOptionalString(value, "id") ?? `split-${fallbackPath}`,
      kind: "split",
      ratio: typeof value.ratio === "number" ? value.ratio : 0.5,
      second,
    };
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

  const hiddenRuntimeTabKeys = Array.isArray(value.hiddenRuntimeTabKeys)
    ? value.hiddenRuntimeTabKeys.filter((key): key is string => typeof key === "string")
    : [];
  const rootPane = parseWorkspacePaneNode(value.rootPane, "root") ?? {
    activeTabKey: typeof value.activeTabKey === "string" ? value.activeTabKey : null,
    id: DEFAULT_WORKSPACE_PANE_ID,
    kind: "leaf" as const,
    tabOrderKeys: Array.isArray(value.tabOrderKeys)
      ? value.tabOrderKeys.filter((key): key is string => typeof key === "string")
      : [],
  };
  const viewStateByTabKey = isRecord(value.viewStateByTabKey)
    ? Object.fromEntries(
        Object.entries(value.viewStateByTabKey).flatMap(([key, nextValue]) => {
          if (!isRecord(nextValue)) {
            return [];
          }

          const viewState: WorkspaceSurfaceTabViewState = {};

          if (typeof nextValue.scrollTop === "number") {
            viewState.scrollTop = nextValue.scrollTop;
          }

          if (nextValue.fileMode === "view" || nextValue.fileMode === "edit") {
            viewState.fileMode = nextValue.fileMode;
          }

          return Object.keys(viewState).length > 0 ? [[key, viewState] as const] : [];
        }),
      )
    : {};

  return normalizeWorkspaceSurfaceState({
    activePaneId:
      typeof value.activePaneId === "string" ? value.activePaneId : DEFAULT_WORKSPACE_PANE_ID,
    documents,
    hiddenRuntimeTabKeys,
    rootPane,
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

function serializeWorkspacePaneNode(node: WorkspacePaneNode): Record<string, unknown> {
  if (isWorkspacePaneLeaf(node)) {
    return {
      activeTabKey: node.activeTabKey,
      id: node.id,
      kind: node.kind,
      tabOrderKeys: node.tabOrderKeys,
    };
  }

  return {
    direction: node.direction,
    first: serializeWorkspacePaneNode(node.first),
    id: node.id,
    kind: node.kind,
    ratio: node.ratio,
    second: serializeWorkspacePaneNode(node.second),
  };
}

function serializeWorkspaceSurfaceState(state: WorkspaceSurfaceState): PersistedWorkspaceState {
  const normalizedState = normalizeWorkspaceSurfaceState(state);

  const serializedState: PersistedWorkspaceState = {
    activePaneId: normalizedState.activePaneId,
    documents: normalizedState.documents.map((document) =>
      serializeWorkspaceSurfaceDocument(document),
    ),
    rootPane: serializeWorkspacePaneNode(normalizedState.rootPane),
  };

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
  const panesAreEmpty = collectWorkspacePaneLeaves(normalizedState.rootPane).every(
    (pane) => pane.activeTabKey === null && pane.tabOrderKeys.length === 0,
  );

  if (
    normalizedState.documents.length === 0 &&
    panesAreEmpty &&
    normalizedState.hiddenRuntimeTabKeys.length === 0 &&
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
