import {
  type ProjectContentTab,
  type ProjectContentTabsState,
  type ProjectViewId,
} from "../types/project-content-tabs";
import {
  reorderProjectContentTabIds,
  type ProjectContentTabPlacement,
} from "../lib/project-content-tab-order";

const PROJECT_CONTENT_TABS_STORAGE_KEY = "lifecycle.desktop.project-content-tabs";

export interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

type PersistedProjectContentTabsState = {
  activeTabId?: unknown;
  tabs?: unknown;
};

type PersistedProjectContentTabsStateMap = Record<string, PersistedProjectContentTabsState>;

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

function isProjectViewId(value: unknown): value is ProjectViewId {
  return value === "overview";
}

export function projectViewTabId(viewId: ProjectViewId): string {
  return `view:${viewId}`;
}

export function workspaceTabId(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export function pullRequestTabId(pullRequestNumber: number): string {
  return `pull-request:${pullRequestNumber}`;
}

export function createProjectViewTab(viewId: ProjectViewId): ProjectContentTab {
  return {
    id: projectViewTabId(viewId),
    kind: "project-view",
    viewId,
  };
}

export function createWorkspaceTab(workspaceId: string): ProjectContentTab {
  return {
    id: workspaceTabId(workspaceId),
    kind: "workspace",
    workspaceId,
  };
}

export function createPullRequestTab(pullRequestNumber: number): ProjectContentTab {
  return {
    id: pullRequestTabId(pullRequestNumber),
    kind: "pull-request",
    pullRequestNumber,
  };
}

export function createDefaultProjectContentTabsState(): ProjectContentTabsState {
  const overviewTab = createProjectViewTab("overview");
  return {
    activeTabId: overviewTab.id,
    tabs: [overviewTab],
  };
}

function isPersistedProjectContentTab(value: unknown): value is ProjectContentTab {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "project-view") {
    return isProjectViewId(value.viewId);
  }

  if (value.kind === "workspace") {
    return typeof value.workspaceId === "string" && value.workspaceId.length > 0;
  }

  if (value.kind === "pull-request") {
    return (
      typeof value.pullRequestNumber === "number" &&
      Number.isInteger(value.pullRequestNumber) &&
      value.pullRequestNumber > 0
    );
  }

  return false;
}

function normalizeProjectContentTab(tab: ProjectContentTab): ProjectContentTab {
  if (tab.kind === "project-view") {
    return createProjectViewTab(tab.viewId);
  }

  if (tab.kind === "workspace") {
    return createWorkspaceTab(tab.workspaceId);
  }

  return createPullRequestTab(tab.pullRequestNumber);
}

export function normalizeProjectContentTabsState(
  state: ProjectContentTabsState | null | undefined,
  options?: {
    availableWorkspaceIds?: ReadonlySet<string>;
  },
): ProjectContentTabsState {
  const availableWorkspaceIds = options?.availableWorkspaceIds;
  const tabsInput = state?.tabs ?? [];
  const seenTabIds = new Set<string>();
  const tabs: ProjectContentTab[] = [];

  for (const tab of tabsInput) {
    if (!isPersistedProjectContentTab(tab)) {
      continue;
    }

    const normalizedTab = normalizeProjectContentTab(tab);
    if (
      normalizedTab.kind === "workspace" &&
      availableWorkspaceIds &&
      !availableWorkspaceIds.has(normalizedTab.workspaceId)
    ) {
      continue;
    }

    if (seenTabIds.has(normalizedTab.id)) {
      continue;
    }

    seenTabIds.add(normalizedTab.id);
    tabs.push(normalizedTab);
  }

  if (!tabs.some((tab) => tab.kind === "project-view" && tab.viewId === "overview")) {
    tabs.unshift(createProjectViewTab("overview"));
  }

  if (tabs.length === 0) {
    return createDefaultProjectContentTabsState();
  }

  const activeTabId =
    state?.activeTabId && tabs.some((tab) => tab.id === state.activeTabId)
      ? state.activeTabId
      : (tabs.at(-1)?.id ?? createDefaultProjectContentTabsState().activeTabId);

  return {
    activeTabId,
    tabs,
  };
}

export function focusProjectViewTab(
  state: ProjectContentTabsState,
  viewId: ProjectViewId,
): ProjectContentTabsState {
  const nextState = normalizeProjectContentTabsState(state);
  const tabId = projectViewTabId(viewId);
  const existingTab = nextState.tabs.find((tab) => tab.id === tabId);

  if (existingTab) {
    return {
      ...nextState,
      activeTabId: existingTab.id,
    };
  }

  const nextTab = createProjectViewTab(viewId);
  return {
    activeTabId: nextTab.id,
    tabs: [...nextState.tabs, nextTab],
  };
}

export function focusWorkspaceTab(
  state: ProjectContentTabsState,
  workspaceId: string,
): ProjectContentTabsState {
  const nextState = normalizeProjectContentTabsState(state);
  const tabId = workspaceTabId(workspaceId);
  const existingTab = nextState.tabs.find((tab) => tab.id === tabId);

  if (existingTab) {
    return {
      ...nextState,
      activeTabId: existingTab.id,
    };
  }

  const nextTab = createWorkspaceTab(workspaceId);
  return {
    activeTabId: nextTab.id,
    tabs: [...nextState.tabs, nextTab],
  };
}

export function focusPullRequestTab(
  state: ProjectContentTabsState,
  pullRequestNumber: number,
): ProjectContentTabsState {
  const nextState = normalizeProjectContentTabsState(state);
  const tabId = pullRequestTabId(pullRequestNumber);
  const existingTab = nextState.tabs.find((tab) => tab.id === tabId);

  if (existingTab) {
    return {
      ...nextState,
      activeTabId: existingTab.id,
    };
  }

  const nextTab = createPullRequestTab(pullRequestNumber);
  return {
    activeTabId: nextTab.id,
    tabs: [...nextState.tabs, nextTab],
  };
}

export function closeProjectContentTab(
  state: ProjectContentTabsState,
  tabId: string,
): ProjectContentTabsState {
  const nextState = normalizeProjectContentTabsState(state);
  const tabToClose = nextState.tabs.find((tab) => tab.id === tabId);

  if (!tabToClose) {
    return nextState;
  }

  if (tabToClose.kind === "project-view" && tabToClose.viewId === "overview") {
    return nextState;
  }

  const nextTabs = nextState.tabs.filter((tab) => tab.id !== tabId);
  const normalizedNextState = normalizeProjectContentTabsState({
    activeTabId: nextState.activeTabId,
    tabs: nextTabs,
  });

  if (nextState.activeTabId !== tabId) {
    return normalizedNextState;
  }

  const closedTabIndex = nextState.tabs.findIndex((tab) => tab.id === tabId);
  const fallbackTab =
    nextState.tabs[closedTabIndex - 1] ??
    nextState.tabs[closedTabIndex + 1] ??
    normalizedNextState.tabs[0];

  return {
    ...normalizedNextState,
    activeTabId: fallbackTab?.id ?? normalizedNextState.activeTabId,
  };
}

export function canCloseProjectContentTab(tab: ProjectContentTab | null | undefined): boolean {
  return !(!tab || (tab.kind === "project-view" && tab.viewId === "overview"));
}

export function resolveProjectContentTabIdToClose({
  activeTab,
  activeWorkspaceSupportsCanvas,
}: {
  activeTab: ProjectContentTab | null;
  activeWorkspaceSupportsCanvas: boolean;
}): string | null {
  if (!activeTab || activeWorkspaceSupportsCanvas || !canCloseProjectContentTab(activeTab)) {
    return null;
  }

  return activeTab.id;
}

export function reorderProjectContentTabs(
  state: ProjectContentTabsState,
  draggedTabId: string,
  targetTabId: string,
  placement: ProjectContentTabPlacement,
): ProjectContentTabsState {
  const nextState = normalizeProjectContentTabsState(state);
  const nextTabIds = reorderProjectContentTabIds(
    nextState.tabs.map((tab) => tab.id),
    draggedTabId,
    targetTabId,
    placement,
  );

  if (
    nextTabIds.length !== nextState.tabs.length ||
    nextTabIds.every((tabId, index) => tabId === nextState.tabs[index]?.id)
  ) {
    return nextState;
  }

  const tabsById = new Map(nextState.tabs.map((tab) => [tab.id, tab]));
  const reorderedTabs = nextTabIds
    .map((tabId) => tabsById.get(tabId))
    .filter((tab): tab is ProjectContentTab => Boolean(tab));

  return reorderedTabs.length === nextState.tabs.length
    ? {
        ...nextState,
        tabs: reorderedTabs,
      }
    : nextState;
}

export function getActiveProjectContentTab(
  state: ProjectContentTabsState,
): ProjectContentTab | null {
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
}

export function projectContentTabsStateEquals(
  left: ProjectContentTabsState,
  right: ProjectContentTabsState,
): boolean {
  if (left.activeTabId !== right.activeTabId || left.tabs.length !== right.tabs.length) {
    return false;
  }

  return left.tabs.every((tab, index) => {
    const otherTab = right.tabs[index];
    if (!otherTab || tab.id !== otherTab.id || tab.kind !== otherTab.kind) {
      return false;
    }

    if (tab.kind === "workspace" && otherTab.kind === "workspace") {
      return tab.workspaceId === otherTab.workspaceId;
    }

    if (tab.kind === "pull-request" && otherTab.kind === "pull-request") {
      return tab.pullRequestNumber === otherTab.pullRequestNumber;
    }

    return tab.kind === "project-view" && otherTab.kind === "project-view"
      ? tab.viewId === otherTab.viewId
      : false;
  });
}

export function readProjectContentTabsState(
  projectId: string,
  storage?: StorageLike,
): ProjectContentTabsState {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return createDefaultProjectContentTabsState();
  }

  try {
    const rawStateMap = resolvedStorage.getItem(PROJECT_CONTENT_TABS_STORAGE_KEY);
    if (!rawStateMap) {
      return createDefaultProjectContentTabsState();
    }

    const parsedStateMap = JSON.parse(rawStateMap) as unknown;
    if (!isRecord(parsedStateMap)) {
      return createDefaultProjectContentTabsState();
    }

    const persistedState = parsedStateMap[projectId];
    if (!isRecord(persistedState)) {
      return createDefaultProjectContentTabsState();
    }

    return normalizeProjectContentTabsState({
      activeTabId: typeof persistedState.activeTabId === "string" ? persistedState.activeTabId : "",
      tabs: Array.isArray(persistedState.tabs) ? persistedState.tabs : [],
    });
  } catch {
    return createDefaultProjectContentTabsState();
  }
}

export function writeProjectContentTabsState(
  projectId: string,
  state: ProjectContentTabsState,
  storage?: StorageLike,
): void {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  try {
    const rawStateMap = resolvedStorage.getItem(PROJECT_CONTENT_TABS_STORAGE_KEY);
    const parsedStateMap = rawStateMap ? (JSON.parse(rawStateMap) as unknown) : {};
    const nextStateMap: PersistedProjectContentTabsStateMap = isRecord(parsedStateMap)
      ? (parsedStateMap as PersistedProjectContentTabsStateMap)
      : {};

    nextStateMap[projectId] = normalizeProjectContentTabsState(state);
    resolvedStorage.setItem(PROJECT_CONTENT_TABS_STORAGE_KEY, JSON.stringify(nextStateMap));
  } catch {
    // best-effort persistence
  }
}
