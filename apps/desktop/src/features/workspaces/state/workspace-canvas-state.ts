import type { FileEditorMode } from "@/features/editor/lib/file-editor-mode";
import {
  createWorkspacePane,
  DEFAULT_WORKSPACE_PANE_ID,
  inspectWorkspacePaneLayout,
  isWorkspacePaneLeaf,
} from "@/features/workspaces/lib/workspace-pane-layout";
import {
  parseWorkspaceSurfaceTab,
  serializeWorkspaceSurfaceTab,
} from "@/features/workspaces/surfaces/workspace-surface-registry";
import {
  getOptionalString,
  isRecord,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import type {
  AgentTab,
  ChangesDiffTab,
  CommitDiffTab,
  FileEditorTab,
  PreviewTab,
  PullRequestTab,
  WorkspaceCanvasTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";

const LAST_WORKSPACE_ID_STORAGE_KEY = "lifecycle.desktop.last-workspace-id";
const WORKSPACE_CANVAS_STATE_STORAGE_KEY = "lifecycle.desktop.workspace-canvas";

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}
export type {
  AgentTab,
  ChangesDiffTab,
  CommitDiffTab,
  FileEditorTab,
  PreviewTab,
  PullRequestTab,
  WorkspaceCanvasTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";
export {
  agentTabKey,
  changesDiffTabKey,
  commitDiffTabKey,
  createAgentTab,
  createChangesDiffTab,
  createCommitDiffTab,
  createFileEditorTab,
  createPreviewTab,
  createPullRequestTab,
  fileEditorTabKey,
  isAgentTab,
  isChangesDiffTab,
  isCommitDiffTab,
  isFileEditorTab,
  isPreviewTab,
  isPullRequestTab,
  previewTabKey,
  pullRequestTabKey,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";

export type WorkspaceCanvasTabsByKey = Record<string, WorkspaceCanvasTab>;

export interface WorkspaceCanvasTabViewState {
  fileMode?: FileEditorMode;
  scrollTop?: number;
  stickToBottom?: boolean;
}

export interface WorkspaceCanvasTabState {
  hidden?: boolean;
  viewState?: WorkspaceCanvasTabViewState;
}

export type WorkspaceCanvasTabStateByKey = Record<string, WorkspaceCanvasTabState>;

export interface ClosedTabEntry {
  tab: WorkspaceCanvasTab;
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
  tabsByKey: WorkspaceCanvasTabsByKey;
  paneTabStateById: WorkspacePaneTabStateById;
  rootPane: WorkspacePaneNode;
  tabStateByKey: WorkspaceCanvasTabStateByKey;
}

const MAX_PERSISTED_CLOSED_TAB_STACK_SIZE = 10;

type PersistedWorkspaceState = {
  activePaneId?: unknown;
  closedTabStack?: unknown;
  paneTabStateById?: unknown;
  rootPane?: unknown;
  tabStateByKey?: unknown;
  tabs?: unknown;
};

type PersistedWorkspaceStateMap = Record<string, PersistedWorkspaceState>;

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function createDefaultWorkspaceCanvasState(): WorkspaceCanvasState {
  return {
    activePaneId: DEFAULT_WORKSPACE_PANE_ID,
    closedTabStack: [],
    tabsByKey: {},
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

function indexWorkspaceTabs(tabs: readonly WorkspaceCanvasTab[]): WorkspaceCanvasTabsByKey {
  const tabsByKey: WorkspaceCanvasTabsByKey = {};

  for (const tab of tabs) {
    tabsByKey[tab.key] = tab;
  }

  return tabsByKey;
}

function normalizeTabsByKey(tabsByKey: WorkspaceCanvasTabsByKey): WorkspaceCanvasTabsByKey {
  const normalized: WorkspaceCanvasTabsByKey = {};

  for (const [key, tab] of Object.entries(tabsByKey)) {
    if (key !== tab.key) {
      normalized[tab.key] = tab;
      continue;
    }

    normalized[key] = tab;
  }

  return normalized;
}

export function listWorkspaceTabs(tabsByKey: WorkspaceCanvasTabsByKey): WorkspaceCanvasTab[] {
  return Object.values(tabsByKey);
}

export function getWorkspaceTab(
  tabsByKey: WorkspaceCanvasTabsByKey,
  key: string,
): WorkspaceCanvasTab | null {
  return tabsByKey[key] ?? null;
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
  knownTabKeys: ReadonlySet<string>,
): WorkspacePaneTabStateById {
  const normalized: WorkspacePaneTabStateById = {};
  const seenTabKeys = new Set<string>();

  for (const paneId of paneIds) {
    const paneTabState = paneTabStateById[paneId] ?? createDefaultWorkspacePaneTabState();
    const tabOrderKeys: string[] = [];

    for (const key of normalizeTabKeyList(paneTabState.tabOrderKeys)) {
      if (seenTabKeys.has(key) || !knownTabKeys.has(key)) {
        continue;
      }

      seenTabKeys.add(key);
      tabOrderKeys.push(key);
    }

    const requestedActiveTabKey =
      typeof paneTabState.activeTabKey === "string" &&
      paneTabState.activeTabKey.length > 0 &&
      knownTabKeys.has(paneTabState.activeTabKey)
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

    if (Number.isFinite(tabState.viewState?.scrollTop)) {
      nextViewState.scrollTop = tabState.viewState?.scrollTop;
    }

    if (tabState.viewState?.stickToBottom === true) {
      nextViewState.stickToBottom = true;
    }

    if (nextViewState.stickToBottom === true) {
      delete nextViewState.scrollTop;
    }

    const nextTabState: WorkspaceCanvasTabState = {};

    if (
      nextViewState.fileMode ||
      typeof nextViewState.scrollTop === "number" ||
      nextViewState.stickToBottom
    ) {
      nextTabState.viewState = nextViewState;
    }

    if (nextTabState.hidden || nextTabState.viewState) {
      normalized[key] = nextTabState;
    }
  }

  return normalized;
}

function normalizeWorkspaceCanvasState(state: WorkspaceCanvasState): WorkspaceCanvasState {
  const tabsByKey = normalizeTabsByKey(state.tabsByKey);
  const persistedTabKeys = new Set(Object.keys(tabsByKey));
  const rootPane = normalizeWorkspacePaneNode(state.rootPane, new Set<string>(), "root");
  const layout = inspectWorkspacePaneLayout(rootPane);
  const paneTabStateById = normalizeWorkspacePaneTabStateById(
    state.paneTabStateById,
    layout.paneIds,
    persistedTabKeys,
  );
  const activePaneId =
    state.activePaneId && layout.paneIds.includes(state.activePaneId)
      ? state.activePaneId
      : layout.firstPane.id;
  const knownTabKeys = new Set([
    ...Object.keys(tabsByKey),
    ...Object.values(paneTabStateById).flatMap((paneTabState) => paneTabState.tabOrderKeys),
    ...Object.values(paneTabStateById).flatMap((paneTabState) =>
      paneTabState.activeTabKey ? [paneTabState.activeTabKey] : [],
    ),
  ]);
  const tabStateByKey = normalizeWorkspaceCanvasTabStateByKey(state.tabStateByKey, knownTabKeys);

  return {
    activePaneId,
    closedTabStack: state.closedTabStack ?? [],
    tabsByKey,
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

function parseWorkspaceCanvasTab(value: unknown): WorkspaceCanvasTab | null {
  return parseWorkspaceSurfaceTab(value);
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

  const persistedTabs = Array.isArray(value.tabs) ? value.tabs : [];
  const tabsByKey = indexWorkspaceTabs(
    persistedTabs
      .map((tab) => parseWorkspaceCanvasTab(tab))
      .filter((tab): tab is WorkspaceCanvasTab => tab !== null),
  );

  const rootPane = parseWorkspacePaneNode(value.rootPane, "root") ?? createWorkspacePane();
  const paneTabStateById = isRecord(value.paneTabStateById)
    ? Object.fromEntries(
        Object.entries(value.paneTabStateById).flatMap(([paneId, nextValue]) => {
          if (!isRecord(nextValue)) {
            return [];
          }

          const paneTabState = createDefaultWorkspacePaneTabState();
          const activeTabKey = getOptionalString(nextValue, "activeTabKey");
          paneTabState.activeTabKey = activeTabKey ?? null;
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

          if (nextValue.stickToBottom === true) {
            viewState.stickToBottom = true;
          }

          if (nextValue.fileMode === "view" || nextValue.fileMode === "edit") {
            viewState.fileMode = nextValue.fileMode;
          }

          if (viewState.stickToBottom === true) {
            delete viewState.scrollTop;
          }

          if (Object.keys(viewState).length > 0) {
            tabState.viewState = viewState;
          }

          return tabState.hidden || tabState.viewState ? [[key, tabState] as const] : [];
        }),
      )
    : {};

  const closedTabStack: ClosedTabEntry[] = [];
  if (Array.isArray(value.closedTabStack)) {
    for (const entry of value.closedTabStack) {
      if (!isRecord(entry)) {
        continue;
      }

      const tab = parseWorkspaceCanvasTab(entry.tab);
      if (!tab) {
        continue;
      }

      const viewState: WorkspaceCanvasTabViewState = {};
      if (isRecord(entry.viewState)) {
        if (typeof entry.viewState.scrollTop === "number") {
          viewState.scrollTop = entry.viewState.scrollTop;
        }
        if (entry.viewState.stickToBottom === true) {
          viewState.stickToBottom = true;
          delete viewState.scrollTop;
        }
        if (entry.viewState.fileMode === "view" || entry.viewState.fileMode === "edit") {
          viewState.fileMode = entry.viewState.fileMode;
        }
      }

      closedTabStack.push({
        tab,
        viewState: Object.keys(viewState).length > 0 ? viewState : null,
      });

      if (closedTabStack.length >= MAX_PERSISTED_CLOSED_TAB_STACK_SIZE) {
        break;
      }
    }
  }

  return normalizeWorkspaceCanvasState({
    activePaneId:
      typeof value.activePaneId === "string" ? value.activePaneId : DEFAULT_WORKSPACE_PANE_ID,
    closedTabStack,
    tabsByKey,
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

function serializeWorkspaceCanvasTab(tab: WorkspaceCanvasTab): Record<string, unknown> {
  return serializeWorkspaceSurfaceTab(tab);
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
    tabs: listWorkspaceTabs(normalizedState.tabsByKey).map((tab) =>
      serializeWorkspaceCanvasTab(tab),
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

  if (normalizedState.closedTabStack.length > 0) {
    serializedState.closedTabStack = normalizedState.closedTabStack
      .slice(0, MAX_PERSISTED_CLOSED_TAB_STACK_SIZE)
      .map((entry) => ({
        tab: serializeWorkspaceCanvasTab(entry.tab),
        viewState: entry.viewState ?? null,
      }));
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
    Object.keys(normalizedState.tabsByKey).length === 0 &&
    panesAreEmpty &&
    usesDefaultSinglePaneLayout &&
    Object.keys(normalizedState.tabStateByKey).length === 0
  ) {
    delete nextMap[workspaceId];
  } else {
    nextMap[workspaceId] = serializeWorkspaceCanvasState(normalizedState);
  }

  try {
    if (Object.keys(nextMap).length === 0) {
      resolvedStorage.removeItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY);
    } else {
      resolvedStorage.setItem(WORKSPACE_CANVAS_STATE_STORAGE_KEY, JSON.stringify(nextMap));
    }
  } catch (error) {
    // QuotaExceededError — localStorage is full. Log and continue so the
    // current in-memory state isn't lost. A future toast system should
    // surface this to the user.
    console.error("[workspace-canvas] failed to persist canvas state:", error);
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
