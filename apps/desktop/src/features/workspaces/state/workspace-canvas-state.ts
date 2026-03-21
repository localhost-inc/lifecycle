import type {
  GitLogEntry,
  GitPullRequestCheckSummary,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import type { FileViewerMode } from "@/features/files/lib/file-view-mode";
import {
  createWorkspacePane,
  DEFAULT_WORKSPACE_PANE_ID,
  inspectWorkspacePaneLayout,
  isWorkspacePaneLeaf,
} from "@/features/workspaces/lib/workspace-pane-layout";
import {
  normalizeWorkspaceFilePath,
  workspaceFileBasename,
  workspaceFileExtension,
} from "@/features/workspaces/lib/workspace-file-paths";

const LAST_WORKSPACE_ID_STORAGE_KEY = "lifecycle.desktop.last-workspace-id";
const WORKSPACE_CANVAS_STATE_STORAGE_KEY = "lifecycle.desktop.workspace-canvas";

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface ChangesDiffDocument {
  focusPath: string | null;
  key: string;
  kind: "changes-diff";
  label: "Workspace Diff";
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

export type WorkspaceCanvasDocument =
  | ChangesDiffDocument
  | CommitDiffDocument
  | FileViewerDocument
  | PullRequestDocument;

export type WorkspaceCanvasDocumentsByKey = Record<string, WorkspaceCanvasDocument>;

export interface WorkspaceCanvasTabViewState {
  fileMode?: FileViewerMode;
  scrollTop?: number;
}

export interface WorkspaceCanvasTabState {
  hidden?: boolean;
  viewState?: WorkspaceCanvasTabViewState;
}

export type WorkspaceCanvasTabStateByKey = Record<string, WorkspaceCanvasTabState>;

export interface ClosedTabEntry {
  document: WorkspaceCanvasDocument;
  viewState: WorkspaceCanvasTabViewState | null;
}

export const MAX_CLOSED_TAB_STACK_SIZE = 20;

export interface WorkspacePaneLeaf {
  id: string;
  kind: "leaf";
}

export interface WorkspacePaneTabState {
  activeTabKey: string | null;
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
export type WorkspacePaneTabStateById = Record<string, WorkspacePaneTabState>;

export interface WorkspacePaneTabSnapshot extends WorkspacePaneTabState {
  id: string;
}

export interface WorkspaceCanvasState {
  activePaneId: string;
  closedTabStack: ClosedTabEntry[];
  documentsByKey: WorkspaceCanvasDocumentsByKey;
  paneTabStateById: WorkspacePaneTabStateById;
  rootPane: WorkspacePaneNode;
  tabStateByKey: WorkspaceCanvasTabStateByKey;
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
  documents?: unknown;
  paneTabStateById?: unknown;
  rootPane?: unknown;
  tabStateByKey?: unknown;
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

const TERMINAL_TAB_KEY_PREFIX = "terminal:";

export function isTerminalTabKey(value: string): boolean {
  return value.startsWith(TERMINAL_TAB_KEY_PREFIX);
}

export function terminalTabKey(terminalId: string): string {
  return `${TERMINAL_TAB_KEY_PREFIX}${terminalId}`;
}

export function terminalIdFromTabKey(value: string): string | null {
  return isTerminalTabKey(value) ? value.slice(TERMINAL_TAB_KEY_PREFIX.length) : null;
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
    label: "Workspace Diff",
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

export function isChangesDiffDocument(
  document: WorkspaceCanvasDocument,
): document is ChangesDiffDocument {
  return document.kind === "changes-diff";
}

export function isCommitDiffDocument(
  document: WorkspaceCanvasDocument,
): document is CommitDiffDocument {
  return document.kind === "commit-diff";
}

export function isPullRequestDocument(
  document: WorkspaceCanvasDocument,
): document is PullRequestDocument {
  return document.kind === "pull-request";
}

export function isFileViewerDocument(
  document: WorkspaceCanvasDocument,
): document is FileViewerDocument {
  return document.kind === "file-viewer";
}

export function createDefaultWorkspaceCanvasState(): WorkspaceCanvasState {
  return {
    activePaneId: DEFAULT_WORKSPACE_PANE_ID,
    closedTabStack: [],
    documentsByKey: {},
    paneTabStateById: {
      [DEFAULT_WORKSPACE_PANE_ID]: createDefaultWorkspacePaneTabState(),
    },
    rootPane: createWorkspacePane(),
    tabStateByKey: {},
  };
}

export function createDefaultWorkspacePaneTabState(): WorkspacePaneTabState {
  return {
    activeTabKey: null,
    tabOrderKeys: [],
  };
}

function indexWorkspaceDocuments(
  documents: readonly WorkspaceCanvasDocument[],
): WorkspaceCanvasDocumentsByKey {
  const documentsByKey: WorkspaceCanvasDocumentsByKey = {};

  for (const document of documents) {
    documentsByKey[document.key] = document;
  }

  return documentsByKey;
}

function normalizeDocumentsByKey(
  documentsByKey: WorkspaceCanvasDocumentsByKey,
): WorkspaceCanvasDocumentsByKey {
  const normalized: WorkspaceCanvasDocumentsByKey = {};

  for (const [key, document] of Object.entries(documentsByKey)) {
    if (key !== document.key) {
      normalized[document.key] = document;
      continue;
    }

    normalized[key] = document;
  }

  return normalized;
}

export function listWorkspaceDocuments(
  documentsByKey: WorkspaceCanvasDocumentsByKey,
): WorkspaceCanvasDocument[] {
  return Object.values(documentsByKey);
}

export function getWorkspaceDocument(
  documentsByKey: WorkspaceCanvasDocumentsByKey,
  key: string,
): WorkspaceCanvasDocument | null {
  return documentsByKey[key] ?? null;
}

export function getWorkspaceTabState(
  tabStateByKey: WorkspaceCanvasTabStateByKey,
  key: string,
): WorkspaceCanvasTabState | null {
  return tabStateByKey[key] ?? null;
}

export function getWorkspacePaneTabState(
  paneTabStateById: WorkspacePaneTabStateById,
  paneId: string,
): WorkspacePaneTabState {
  return paneTabStateById[paneId] ?? createDefaultWorkspacePaneTabState();
}

export function listWorkspacePaneTabSnapshots(
  rootPane: WorkspacePaneNode,
  paneTabStateById: WorkspacePaneTabStateById,
): WorkspacePaneTabSnapshot[] {
  return inspectWorkspacePaneLayout(rootPane).panes.map((pane) => ({
    ...getWorkspacePaneTabState(paneTabStateById, pane.id),
    id: pane.id,
  }));
}

export function findWorkspacePaneIdContainingTab(
  rootPane: WorkspacePaneNode,
  paneTabStateById: WorkspacePaneTabStateById,
  tabKey: string,
): string | null {
  return (
    inspectWorkspacePaneLayout(rootPane).panes.find((pane) =>
      (paneTabStateById[pane.id]?.tabOrderKeys ?? []).includes(tabKey),
    )?.id ?? null
  );
}

export function getWorkspaceTabViewState(
  tabStateByKey: WorkspaceCanvasTabStateByKey,
  key: string,
): WorkspaceCanvasTabViewState | null {
  return tabStateByKey[key]?.viewState ?? null;
}

export function listWorkspaceHiddenTerminalTabKeys(
  tabStateByKey: WorkspaceCanvasTabStateByKey,
): string[] {
  return Object.entries(tabStateByKey).flatMap(([key, tabState]) =>
    tabState.hidden && isTerminalTabKey(key) ? [key] : [],
  );
}

export function listWorkspaceTabViewStateByKey(
  tabStateByKey: WorkspaceCanvasTabStateByKey,
): Record<string, WorkspaceCanvasTabViewState> {
  return Object.fromEntries(
    Object.entries(tabStateByKey).flatMap(([key, tabState]) =>
      tabState.viewState ? [[key, tabState.viewState] as const] : [],
    ),
  );
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
  seenNodeIds: Set<string>,
  path: string,
): WorkspacePaneNode {
  if (isWorkspacePaneLeaf(node)) {
    const fallbackId = path === "root" ? DEFAULT_WORKSPACE_PANE_ID : `pane-${path}`;
    const id =
      typeof node.id === "string" && node.id.length > 0 && !seenNodeIds.has(node.id)
        ? node.id
        : fallbackId;
    seenNodeIds.add(id);

    return {
      id,
      kind: "leaf",
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
    first: normalizeWorkspacePaneNode(node.first, seenNodeIds, `${path}-first`),
    id,
    kind: "split",
    ratio:
      typeof node.ratio === "number" &&
      Number.isFinite(node.ratio) &&
      node.ratio > 0 &&
      node.ratio < 1
        ? node.ratio
        : 0.5,
    second: normalizeWorkspacePaneNode(node.second, seenNodeIds, `${path}-second`),
  };
}

function normalizeWorkspacePaneTabStateById(
  paneTabStateById: WorkspacePaneTabStateById,
  paneIds: readonly string[],
  knownDocumentKeys: ReadonlySet<string>,
  hiddenTerminalTabKeySet: ReadonlySet<string>,
): WorkspacePaneTabStateById {
  const normalized: WorkspacePaneTabStateById = {};
  const seenTabKeys = new Set<string>();

  for (const paneId of paneIds) {
    const paneTabState = paneTabStateById[paneId] ?? createDefaultWorkspacePaneTabState();
    const tabOrderKeys: string[] = [];

    for (const key of normalizeTabKeyList(paneTabState.tabOrderKeys)) {
      if (
        hiddenTerminalTabKeySet.has(key) ||
        seenTabKeys.has(key) ||
        (!isTerminalTabKey(key) && !knownDocumentKeys.has(key))
      ) {
        continue;
      }

      seenTabKeys.add(key);
      tabOrderKeys.push(key);
    }

    const requestedActiveTabKey =
      typeof paneTabState.activeTabKey === "string" &&
      paneTabState.activeTabKey.length > 0 &&
      !hiddenTerminalTabKeySet.has(paneTabState.activeTabKey) &&
      (isTerminalTabKey(paneTabState.activeTabKey) ||
        knownDocumentKeys.has(paneTabState.activeTabKey))
        ? paneTabState.activeTabKey
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

    normalized[paneId] = {
      activeTabKey,
      tabOrderKeys,
    };
  }

  return normalized;
}

function normalizeWorkspaceCanvasTabStateByKey(
  tabStateByKey: WorkspaceCanvasTabStateByKey,
  knownTabKeys: ReadonlySet<string>,
): WorkspaceCanvasTabStateByKey {
  const normalized: WorkspaceCanvasTabStateByKey = {};

  for (const [key, tabState] of Object.entries(tabStateByKey)) {
    if (!knownTabKeys.has(key)) {
      continue;
    }

    const nextViewState: WorkspaceCanvasTabViewState = {};

    if (tabState.viewState?.fileMode === "view" || tabState.viewState?.fileMode === "edit") {
      nextViewState.fileMode = tabState.viewState.fileMode;
    }

    if (
      Number.isFinite(tabState.viewState?.scrollTop) &&
      (tabState.viewState?.scrollTop ?? 0) > 0
    ) {
      nextViewState.scrollTop = tabState.viewState?.scrollTop;
    }

    const nextTabState: WorkspaceCanvasTabState = {};

    if (tabState.hidden && isTerminalTabKey(key)) {
      nextTabState.hidden = true;
    }

    if (nextViewState.fileMode || typeof nextViewState.scrollTop === "number") {
      nextTabState.viewState = nextViewState;
    }

    if (nextTabState.hidden || nextTabState.viewState) {
      normalized[key] = nextTabState;
    }
  }

  return normalized;
}

function normalizeWorkspaceCanvasState(state: WorkspaceCanvasState): WorkspaceCanvasState {
  const documentsByKey = normalizeDocumentsByKey(state.documentsByKey);
  const knownDocumentKeys = new Set(Object.keys(documentsByKey));
  const hiddenTerminalTabKeySet = new Set(listWorkspaceHiddenTerminalTabKeys(state.tabStateByKey));
  const rootPane = normalizeWorkspacePaneNode(state.rootPane, new Set<string>(), "root");
  const layout = inspectWorkspacePaneLayout(rootPane);
  const paneTabStateById = normalizeWorkspacePaneTabStateById(
    state.paneTabStateById,
    layout.paneIds,
    knownDocumentKeys,
    hiddenTerminalTabKeySet,
  );
  const activePaneId =
    state.activePaneId && layout.paneIds.includes(state.activePaneId)
      ? state.activePaneId
      : layout.firstPane.id;
  const knownTabKeys = new Set([
    ...Object.keys(documentsByKey),
    ...hiddenTerminalTabKeySet,
    ...Object.values(paneTabStateById).flatMap((paneTabState) => paneTabState.tabOrderKeys),
    ...Object.values(paneTabStateById).flatMap((paneTabState) =>
      paneTabState.activeTabKey ? [paneTabState.activeTabKey] : [],
    ),
  ]);
  const tabStateByKey = normalizeWorkspaceCanvasTabStateByKey(state.tabStateByKey, knownTabKeys);

  return {
    activePaneId,
    closedTabStack: state.closedTabStack ?? [],
    documentsByKey,
    paneTabStateById,
    rootPane,
    tabStateByKey,
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

function parseWorkspaceCanvasDocument(value: unknown): WorkspaceCanvasDocument | null {
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

  return null;
}

function parseWorkspacePaneNode(value: unknown, fallbackPath: string): WorkspacePaneNode | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = getOptionalString(value, "kind");
  if (kind === "leaf") {
    return {
      id: getOptionalString(value, "id") ?? `pane-${fallbackPath}`,
      kind: "leaf",
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

function parseWorkspaceCanvasState(value: unknown): WorkspaceCanvasState {
  if (!isRecord(value)) {
    return createDefaultWorkspaceCanvasState();
  }

  const documentsByKey = Array.isArray(value.documents)
    ? indexWorkspaceDocuments(
        value.documents
          .map((document) => parseWorkspaceCanvasDocument(document))
          .filter((document): document is WorkspaceCanvasDocument => document !== null),
      )
    : {};

  const rootPane = parseWorkspacePaneNode(value.rootPane, "root") ?? createWorkspacePane();
  const paneTabStateById = isRecord(value.paneTabStateById)
    ? Object.fromEntries(
        Object.entries(value.paneTabStateById).flatMap(([paneId, nextValue]) => {
          if (!isRecord(nextValue)) {
            return [];
          }

          const paneTabState = createDefaultWorkspacePaneTabState();
          paneTabState.activeTabKey = getOptionalString(nextValue, "activeTabKey") ?? null;
          paneTabState.tabOrderKeys = Array.isArray(nextValue.tabOrderKeys)
            ? nextValue.tabOrderKeys.filter((key): key is string => typeof key === "string")
            : [];

          return [[paneId, paneTabState] as const];
        }),
      )
    : {};
  const tabStateByKey = isRecord(value.tabStateByKey)
    ? Object.fromEntries(
        Object.entries(value.tabStateByKey).flatMap(([key, nextValue]) => {
          if (!isRecord(nextValue)) {
            return [];
          }

          const tabState: WorkspaceCanvasTabState = {};
          const viewState: WorkspaceCanvasTabViewState = {};

          if (nextValue.hidden === true) {
            tabState.hidden = true;
          }

          if (typeof nextValue.scrollTop === "number") {
            viewState.scrollTop = nextValue.scrollTop;
          }

          if (nextValue.fileMode === "view" || nextValue.fileMode === "edit") {
            viewState.fileMode = nextValue.fileMode;
          }

          if (Object.keys(viewState).length > 0) {
            tabState.viewState = viewState;
          }

          return tabState.hidden || tabState.viewState ? [[key, tabState] as const] : [];
        }),
      )
    : {};

  return normalizeWorkspaceCanvasState({
    activePaneId:
      typeof value.activePaneId === "string" ? value.activePaneId : DEFAULT_WORKSPACE_PANE_ID,
    closedTabStack: [],
    documentsByKey,
    paneTabStateById,
    rootPane,
    tabStateByKey,
  });
}

function readPersistedWorkspaceCanvasStateMap(
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

function serializeWorkspaceCanvasDocument(
  document: WorkspaceCanvasDocument,
): Record<string, unknown> {
  if (isChangesDiffDocument(document)) {
    return document.focusPath === null
      ? { kind: document.kind }
      : {
          focusPath: document.focusPath,
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
      id: node.id,
      kind: node.kind,
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

function serializeWorkspaceCanvasState(state: WorkspaceCanvasState): PersistedWorkspaceState {
  const normalizedState = normalizeWorkspaceCanvasState(state);

  const serializedState: PersistedWorkspaceState = {
    activePaneId: normalizedState.activePaneId,
    documents: listWorkspaceDocuments(normalizedState.documentsByKey).map((document) =>
      serializeWorkspaceCanvasDocument(document),
    ),
    paneTabStateById: Object.fromEntries(
      Object.entries(normalizedState.paneTabStateById).map(([paneId, paneTabState]) => [
        paneId,
        {
          activeTabKey: paneTabState.activeTabKey,
          tabOrderKeys: paneTabState.tabOrderKeys,
        },
      ]),
    ),
    rootPane: serializeWorkspacePaneNode(normalizedState.rootPane),
  };

  if (Object.keys(normalizedState.tabStateByKey).length > 0) {
    serializedState.tabStateByKey = Object.fromEntries(
      Object.entries(normalizedState.tabStateByKey).map(([key, tabState]) => [
        key,
        {
          ...(tabState.hidden ? { hidden: true } : {}),
          ...tabState.viewState,
        },
      ]),
    );
  }

  return serializedState;
}

export function readWorkspaceCanvasState(
  workspaceId: string,
  storage?: StorageLike,
): WorkspaceCanvasState {
  const resolvedStorage = getStorage(storage);
  const persistedMap = readPersistedWorkspaceCanvasStateMap(
    resolvedStorage,
    WORKSPACE_CANVAS_STATE_STORAGE_KEY,
  );

  if (persistedMap && workspaceId in persistedMap) {
    return parseWorkspaceCanvasState(persistedMap[workspaceId]);
  }

  return createDefaultWorkspaceCanvasState();
}

export function writeWorkspaceCanvasState(
  workspaceId: string,
  state: WorkspaceCanvasState,
  storage?: StorageLike,
): void {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  const persistedMap =
    readPersistedWorkspaceCanvasStateMap(resolvedStorage, WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? {};
  const nextMap: PersistedWorkspaceStateMap = { ...persistedMap };
  const normalizedState = normalizeWorkspaceCanvasState(state);
  const layout = inspectWorkspacePaneLayout(normalizedState.rootPane);
  const panesAreEmpty = layout.panes.every(
    (pane) =>
      (normalizedState.paneTabStateById[pane.id]?.activeTabKey ?? null) === null &&
      (normalizedState.paneTabStateById[pane.id]?.tabOrderKeys.length ?? 0) === 0,
  );
  const usesDefaultSinglePaneLayout =
    normalizedState.rootPane.kind === "leaf" &&
    normalizedState.rootPane.id === DEFAULT_WORKSPACE_PANE_ID &&
    normalizedState.activePaneId === DEFAULT_WORKSPACE_PANE_ID &&
    layout.paneCount === 1;

  if (
    Object.keys(normalizedState.documentsByKey).length === 0 &&
    panesAreEmpty &&
    usesDefaultSinglePaneLayout &&
    Object.keys(normalizedState.tabStateByKey).length === 0
  ) {
    delete nextMap[workspaceId];
  } else {
    nextMap[workspaceId] = serializeWorkspaceCanvasState(normalizedState);
  }

  if (Object.keys(nextMap).length === 0) {
    resolvedStorage.removeItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY);
  } else {
    resolvedStorage.setItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY, JSON.stringify(nextMap));
  }
}

export function clearWorkspaceCanvasState(workspaceId: string, storage?: StorageLike): void {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  const persistedMap =
    readPersistedWorkspaceCanvasStateMap(resolvedStorage, WORKSPACE_CANVAS_STATE_STORAGE_KEY) ?? {};
  if (!(workspaceId in persistedMap)) {
    return;
  }

  const nextMap: PersistedWorkspaceStateMap = { ...persistedMap };
  delete nextMap[workspaceId];

  if (Object.keys(nextMap).length === 0) {
    resolvedStorage.removeItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY);
  } else {
    resolvedStorage.setItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY, JSON.stringify(nextMap));
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
