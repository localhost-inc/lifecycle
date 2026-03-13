import type {
  GitLogEntry,
  GitPullRequestSummary,
  TerminalRecord,
  TerminalStatus,
} from "@lifecycle/contracts";
import type { DragEvent as ReactDragEvent } from "react";
import type { HarnessProvider } from "../../terminals/api";
import type { WorkspaceShortcutEvent } from "../api";
import {
  closeWorkspacePane,
  collectWorkspacePaneLeaves,
  countWorkspacePanes,
  createWorkspacePane,
  findWorkspacePaneById,
  findWorkspacePaneContainingTab,
  getFirstWorkspacePane,
  splitWorkspacePane,
  updateWorkspacePane,
  updateWorkspaceSplit,
} from "../lib/workspace-surface-panes";
import {
  changesDiffTabKey,
  commitDiffTabKey,
  createChangesDiffTab,
  createCommitDiffTab,
  createFileViewerTab,
  createLauncherTab,
  createPullRequestTab,
  fileViewerTabKey,
  isChangesDiffDocument,
  isCommitDiffDocument,
  isFileViewerDocument,
  isLauncherDocument,
  isPullRequestDocument,
  readWorkspaceSurfaceState,
  pullRequestTabKey,
  type WorkspacePaneLeaf,
  type WorkspaceSurfaceDocument,
  type WorkspaceSurfaceState,
  type WorkspaceSurfaceTabViewState,
} from "../state/workspace-surface-state";

export interface ChangesDiffOpenRequest {
  focusPath: string | null;
  id: string;
  kind: "changes-diff";
}

export interface CommitDiffOpenRequest {
  commit: GitLogEntry;
  id: string;
  kind: "commit-diff";
}

export interface PullRequestOpenRequest {
  id: string;
  pullRequest: GitPullRequestSummary;
  kind: "pull-request";
}

export interface FileViewerOpenRequest {
  filePath: string;
  id: string;
  kind: "file-viewer";
}

export type OpenDocumentRequest =
  | ChangesDiffOpenRequest
  | CommitDiffOpenRequest
  | FileViewerOpenRequest
  | PullRequestOpenRequest;

export type RuntimeTab = {
  harnessProvider: HarnessProvider | null;
  kind: "terminal";
  key: string;
  label: string;
  launchType: TerminalRecord["launch_type"];
  running?: boolean;
  responseReady: boolean;
  status: TerminalStatus;
  terminalId: string;
};

export type WorkspaceSurfaceTab = RuntimeTab | WorkspaceSurfaceDocument;

export type WorkspaceTabPlacement = "after" | "before";

const NO_TAB_DRAG_SHIFT = 0 as const;

export interface WorkspaceTabHotkeyEvent {
  altKey: boolean;
  code?: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export type WorkspaceTabHotkeyAction =
  | { kind: "close-active-tab" }
  | { kind: "new-tab" }
  | { kind: "next-tab" }
  | { kind: "previous-tab" }
  | { kind: "select-tab-index"; index: number };

export interface WorkspaceTabClosePlan {
  nextActiveKey: string | null;
  openLauncher: boolean;
}

export const WORKSPACE_CLOSE_SHORTCUT_GRACE_MS = 250;

export type WorkspaceSurfaceAction =
  | { kind: "open-document"; request: OpenDocumentRequest }
  | { kind: "open-launcher"; launcherId: string; paneId?: string }
  | { kind: "replace-launcher-with-tab"; launcherKey: string; tabKey: string }
  | { kind: "select-pane"; paneId: string }
  | { kind: "select-tab"; key: string | null; paneId: string }
  | { kind: "close-document"; key: string }
  | { kind: "hide-runtime-tab"; key: string }
  | { kind: "show-runtime-tab"; key: string; paneId?: string; select: boolean }
  | { kind: "set-hidden-runtime-tab-keys"; keys: string[] }
  | { kind: "set-pane-tab-order"; keys: string[]; paneId: string }
  | { kind: "set-tab-view-state"; key: string; viewState: WorkspaceSurfaceTabViewState | null }
  | { kind: "sync-pane-active"; key: string | null; paneId: string }
  | {
      key: string;
      kind: "move-tab-to-pane";
      placement?: WorkspaceTabPlacement;
      sourcePaneId: string;
      targetKey?: string;
      targetPaneId: string;
    }
  | {
      direction: "column" | "row";
      kind: "split-pane";
      launcherId: string;
      newPaneId: string;
      paneId: string;
      placement: "after" | "before";
      splitId: string;
    }
  | { kind: "close-pane"; paneId: string }
  | { kind: "set-split-ratio"; ratio: number; splitId: string };

function appendWorkspaceTabKey(keys: readonly string[], key: string): string[] {
  return [...keys.filter((existingKey) => existingKey !== key), key];
}

function removeWorkspaceTabKey(keys: readonly string[], key: string): string[] {
  return keys.filter((existingKey) => existingKey !== key);
}

function insertWorkspaceTabKey(
  keys: readonly string[],
  key: string,
  targetKey: string,
  placement: WorkspaceTabPlacement,
): string[] {
  const nextKeys = removeWorkspaceTabKey(keys, key);
  const targetIndex = nextKeys.indexOf(targetKey);
  if (targetIndex < 0) {
    return appendWorkspaceTabKey(nextKeys, key);
  }

  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  return [...nextKeys.slice(0, insertIndex), key, ...nextKeys.slice(insertIndex)];
}

function omitWorkspaceTabViewState(
  viewStateByTabKey: WorkspaceSurfaceState["viewStateByTabKey"],
  key: string,
): WorkspaceSurfaceState["viewStateByTabKey"] {
  if (!(key in viewStateByTabKey)) {
    return viewStateByTabKey;
  }

  const nextViewStateByTabKey = {
    ...viewStateByTabKey,
  };
  delete nextViewStateByTabKey[key];
  return nextViewStateByTabKey;
}

function appendWorkspaceTabKeys(keys: readonly string[], nextKeys: readonly string[]): string[] {
  return nextKeys.reduce((current, key) => appendWorkspaceTabKey(current, key), [...keys]);
}

function resolveWorkspaceTargetPaneId(state: WorkspaceSurfaceState, paneId?: string): string {
  if (paneId) {
    const requestedPane = findWorkspacePaneById(state.rootPane, paneId);
    if (requestedPane) {
      return requestedPane.id;
    }
  }

  if (state.activePaneId) {
    const activePane = findWorkspacePaneById(state.rootPane, state.activePaneId);
    if (activePane) {
      return activePane.id;
    }
  }

  return getFirstWorkspacePane(state.rootPane).id;
}

function selectWorkspacePaneTab(
  state: WorkspaceSurfaceState,
  paneId: string,
  activeTabKey: string | null,
): WorkspaceSurfaceState {
  return {
    ...state,
    activePaneId: paneId,
    rootPane: updateWorkspacePane(state.rootPane, paneId, (pane) => ({
      ...pane,
      activeTabKey,
    })),
  };
}

function ensureWorkspacePaneLauncher(
  state: WorkspaceSurfaceState,
  paneId: string,
  launcherId: string,
  select: boolean = true,
): WorkspaceSurfaceState {
  const launcher = createLauncherTab(launcherId);

  return {
    ...state,
    activePaneId: select ? paneId : state.activePaneId,
    documents: [...state.documents, launcher],
    rootPane: updateWorkspacePane(state.rootPane, paneId, (pane) => ({
      ...pane,
      activeTabKey: launcher.key,
      tabOrderKeys: appendWorkspaceTabKey(pane.tabOrderKeys, launcher.key),
    })),
  };
}

function resolveWorkspacePanePlaceholderLauncherKeys(
  state: WorkspaceSurfaceState,
  pane: WorkspacePaneLeaf,
): string[] {
  return pane.tabOrderKeys.length === 1 &&
    state.documents.some(
      (document) => document.key === pane.tabOrderKeys[0] && isLauncherDocument(document),
    )
    ? [...pane.tabOrderKeys]
    : [];
}

function removeHiddenRuntimeTabsFromPaneTree(
  rootPane: WorkspaceSurfaceState["rootPane"],
  hiddenRuntimeTabKeySet: ReadonlySet<string>,
): WorkspaceSurfaceState["rootPane"] {
  if (rootPane.kind === "leaf") {
    const activeTabKey =
      rootPane.activeTabKey && hiddenRuntimeTabKeySet.has(rootPane.activeTabKey)
        ? null
        : rootPane.activeTabKey;
    const tabOrderKeys = rootPane.tabOrderKeys.filter((key) => !hiddenRuntimeTabKeySet.has(key));

    return activeTabKey === rootPane.activeTabKey &&
      areStringArraysEqual(tabOrderKeys, rootPane.tabOrderKeys)
      ? rootPane
      : {
          ...rootPane,
          activeTabKey,
          tabOrderKeys,
        };
  }

  const first = removeHiddenRuntimeTabsFromPaneTree(rootPane.first, hiddenRuntimeTabKeySet);
  const second = removeHiddenRuntimeTabsFromPaneTree(rootPane.second, hiddenRuntimeTabKeySet);
  return first === rootPane.first && second === rootPane.second
    ? rootPane
    : {
        ...rootPane,
        first,
        second,
      };
}

export function releaseWebviewFocus(): void {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

export function createWorkspaceLauncherId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createWorkspacePaneId(): string {
  return `pane:${createWorkspaceLauncherId()}`;
}

export function createWorkspaceSplitId(): string {
  return `split:${createWorkspaceLauncherId()}`;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform =
    ("userAgentData" in navigator
      ? (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
      : undefined) ??
    navigator.platform ??
    navigator.userAgent;

  return /mac/i.test(platform);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.closest("[contenteditable='true']") !== null
  );
}

export function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function orderWorkspaceTerminals(terminals: readonly TerminalRecord[]): TerminalRecord[] {
  return [...terminals].sort(
    (left, right) =>
      left.started_at.localeCompare(right.started_at) || left.id.localeCompare(right.id),
  );
}

function orderWorkspaceTabs<T extends Pick<WorkspaceSurfaceTab, "key">>(
  tabs: readonly T[],
  tabOrderKeys: readonly string[],
): T[] {
  const remainingTabs = new Map(tabs.map((tab) => [tab.key, tab]));
  const orderedTabs: T[] = [];

  for (const key of tabOrderKeys) {
    const tab = remainingTabs.get(key);
    if (!tab) {
      continue;
    }

    orderedTabs.push(tab);
    remainingTabs.delete(key);
  }

  for (const tab of tabs) {
    if (!remainingTabs.has(tab.key)) {
      continue;
    }

    orderedTabs.push(tab);
    remainingTabs.delete(tab.key);
  }

  return orderedTabs;
}

export function resolveWorkspaceVisibleTabs(
  runtimeTabs: readonly RuntimeTab[],
  documents: readonly WorkspaceSurfaceDocument[],
  tabOrderKeys: readonly string[],
  hiddenRuntimeTabKeys: readonly string[],
): WorkspaceSurfaceTab[] {
  const hiddenRuntimeTabKeySet = new Set(hiddenRuntimeTabKeys);
  const assignedTabKeySet = new Set(tabOrderKeys);

  return orderWorkspaceTabs(
    [
      ...runtimeTabs.filter(
        (tab) => assignedTabKeySet.has(tab.key) && !hiddenRuntimeTabKeySet.has(tab.key),
      ),
      ...documents.filter((tab) => assignedTabKeySet.has(tab.key)),
    ],
    tabOrderKeys,
  );
}

export function reconcileHiddenRuntimeTabKeys(
  hiddenRuntimeTabKeys: readonly string[],
  knownRuntimeTabKeys: readonly string[],
  terminalsReady: boolean,
): string[] {
  if (!terminalsReady) {
    return [...hiddenRuntimeTabKeys];
  }

  return hiddenRuntimeTabKeys.filter((key) => knownRuntimeTabKeys.includes(key));
}

export function getRightmostWorkspaceTabKey(
  tabs: readonly Pick<WorkspaceSurfaceTab, "key">[],
): string | null {
  return tabs.at(-1)?.key ?? null;
}

export function getWorkspaceTabKeyAfterClose(
  tabKeys: readonly string[],
  closedKey: string,
): string | null {
  const closedIndex = tabKeys.indexOf(closedKey);
  if (closedIndex < 0) {
    return null;
  }

  return tabKeys[closedIndex + 1] ?? tabKeys[closedIndex - 1] ?? null;
}

export function getWorkspaceTabClosePlan(
  tabKeys: readonly string[],
  closedKey: string,
  fallbackLauncherKey: string | null,
): WorkspaceTabClosePlan {
  const nextActiveKey = getWorkspaceTabKeyAfterClose(tabKeys, closedKey);
  if (nextActiveKey) {
    return {
      nextActiveKey,
      openLauncher: false,
    };
  }

  const closingKnownTab = tabKeys.includes(closedKey);
  return {
    nextActiveKey: closingKnownTab ? fallbackLauncherKey : null,
    openLauncher: closingKnownTab && fallbackLauncherKey !== null,
  };
}

export function shouldTreatWindowCloseAsTabClose(
  lastShortcutTriggeredAt: number,
  now: number,
  graceMs: number = WORKSPACE_CLOSE_SHORTCUT_GRACE_MS,
): boolean {
  return (
    lastShortcutTriggeredAt > 0 &&
    now >= lastShortcutTriggeredAt &&
    now - lastShortcutTriggeredAt <= graceMs
  );
}

export function getWorkspaceAdjacentTabKey(
  tabKeys: readonly string[],
  activeKey: string | null,
  direction: "next" | "previous",
): string | null {
  if (!activeKey) {
    return null;
  }

  const activeIndex = tabKeys.indexOf(activeKey);
  if (activeIndex < 0) {
    return null;
  }

  return direction === "next"
    ? (tabKeys[activeIndex + 1] ?? null)
    : (tabKeys[activeIndex - 1] ?? null);
}

export function getWorkspaceTabKeyByIndex(
  tabKeys: readonly string[],
  index: number,
): string | null {
  if (index === 9) {
    return tabKeys.at(-1) ?? null;
  }

  return tabKeys[index - 1] ?? null;
}

export function reorderWorkspaceTabKeys(
  tabKeys: readonly string[],
  draggedKey: string,
  targetKey: string,
  placement: WorkspaceTabPlacement,
): string[] {
  if (draggedKey === targetKey) {
    return [...tabKeys];
  }

  const nextKeys = tabKeys.filter((key) => key !== draggedKey);
  const targetIndex = nextKeys.indexOf(targetKey);
  if (targetIndex < 0) {
    return [...tabKeys];
  }

  const insertionIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [...nextKeys.slice(0, insertionIndex), draggedKey, ...nextKeys.slice(insertionIndex)];
}

export function getWorkspaceTabDragShiftDirection(
  tabKeys: readonly string[],
  draggedKey: string,
  targetKey: string,
  placement: WorkspaceTabPlacement,
  tabKey: string,
): -1 | 0 | 1 {
  if (tabKey === draggedKey) {
    return NO_TAB_DRAG_SHIFT;
  }

  const currentIndex = tabKeys.indexOf(tabKey);
  if (currentIndex < 0) {
    return NO_TAB_DRAG_SHIFT;
  }

  const previewIndex = reorderWorkspaceTabKeys(tabKeys, draggedKey, targetKey, placement).indexOf(
    tabKey,
  );
  if (previewIndex < 0 || previewIndex === currentIndex) {
    return NO_TAB_DRAG_SHIFT;
  }

  return previewIndex < currentIndex ? -1 : 1;
}

export function readWorkspaceTabHotkeyAction(
  event: WorkspaceTabHotkeyEvent,
  macPlatform: boolean,
): WorkspaceTabHotkeyAction | null {
  const lowerKey = event.key.toLowerCase();
  const isBracketLeft = event.code === "BracketLeft" || event.key === "[" || event.key === "{";
  const isBracketRight = event.code === "BracketRight" || event.key === "]" || event.key === "}";

  if (macPlatform) {
    if (!event.metaKey || event.ctrlKey || event.altKey) {
      return null;
    }

    if (!event.shiftKey && lowerKey === "t") {
      return { kind: "new-tab" };
    }

    if (!event.shiftKey && lowerKey === "w") {
      return { kind: "close-active-tab" };
    }

    if (!event.shiftKey && lowerKey >= "1" && lowerKey <= "9") {
      return {
        index: Number.parseInt(lowerKey, 10),
        kind: "select-tab-index",
      };
    }

    if (event.shiftKey && isBracketLeft) {
      return { kind: "previous-tab" };
    }

    if (event.shiftKey && isBracketRight) {
      return { kind: "next-tab" };
    }

    return null;
  }

  if (!event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  if (!event.shiftKey && lowerKey === "t") {
    return { kind: "new-tab" };
  }

  if (!event.shiftKey && lowerKey === "w") {
    return { kind: "close-active-tab" };
  }

  if (!event.shiftKey && lowerKey >= "1" && lowerKey <= "9") {
    return {
      index: Number.parseInt(lowerKey, 10),
      kind: "select-tab-index",
    };
  }

  if (event.key === "Tab") {
    return event.shiftKey ? { kind: "previous-tab" } : { kind: "next-tab" };
  }

  return null;
}

export function workspaceTabDomId(key: string): string {
  return `workspace-tab-${encodeURIComponent(key)}`;
}

export function workspaceTabPanelId(key: string): string {
  return `workspace-panel-${encodeURIComponent(key)}`;
}

export function tabTitle(tab: WorkspaceSurfaceTab): string {
  if (tab.kind === "terminal") {
    return tab.label;
  }

  if (isFileViewerDocument(tab)) {
    return tab.filePath;
  }

  if (isChangesDiffDocument(tab)) {
    return tab.label;
  }

  if (isCommitDiffDocument(tab)) {
    return `${tab.shortSha} ${tab.message}`;
  }

  if (isPullRequestDocument(tab)) {
    return `PR #${tab.number} ${tab.title}`;
  }

  return tab.label;
}

export function getTabDragPlacement(
  event: ReactDragEvent<HTMLElement>,
  element: HTMLElement,
): WorkspaceTabPlacement {
  const rect = element.getBoundingClientRect();
  return event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
}

export function toWorkspaceTabHotkeyAction(
  event: WorkspaceShortcutEvent,
): WorkspaceTabHotkeyAction | null {
  switch (event.action) {
    case "close-active-tab":
      return { kind: "close-active-tab" };
    case "new-tab":
      return { kind: "new-tab" };
    case "next-tab":
      return { kind: "next-tab" };
    case "previous-tab":
      return { kind: "previous-tab" };
    case "select-tab-index":
      return typeof event.index === "number"
        ? { index: event.index, kind: "select-tab-index" }
        : null;
    default:
      return null;
  }
}

export function workspaceSurfaceReducer(
  state: WorkspaceSurfaceState,
  action: WorkspaceSurfaceAction,
): WorkspaceSurfaceState {
  switch (action.kind) {
    case "open-document": {
      const request = action.request;
      const existingPaneForChanges =
        request.kind === "changes-diff"
          ? findWorkspacePaneContainingTab(state.rootPane, changesDiffTabKey())
          : null;
      const existingPaneForFile =
        request.kind === "file-viewer"
          ? findWorkspacePaneContainingTab(state.rootPane, fileViewerTabKey(request.filePath))
          : null;
      const existingPaneForCommit =
        request.kind === "commit-diff"
          ? findWorkspacePaneContainingTab(state.rootPane, commitDiffTabKey(request.commit.sha))
          : null;
      const existingPaneForPullRequest =
        request.kind === "pull-request"
          ? findWorkspacePaneContainingTab(
              state.rootPane,
              pullRequestTabKey(request.pullRequest.number),
            )
          : null;

      if (request.kind === "changes-diff") {
        const key = changesDiffTabKey();
        const existingPane = existingPaneForChanges;
        const targetPaneId = existingPane?.id ?? resolveWorkspaceTargetPaneId(state);
        const hasDocument = state.documents.some((tab) => tab.key === key);

        return {
          ...state,
          activePaneId: targetPaneId,
          documents: hasDocument
            ? state.documents.map((tab) =>
                tab.key === key && isChangesDiffDocument(tab)
                  ? { ...tab, focusPath: request.focusPath }
                  : tab,
              )
            : [...state.documents, createChangesDiffTab(request.focusPath)],
          rootPane: updateWorkspacePane(state.rootPane, targetPaneId, (pane) => ({
            ...pane,
            activeTabKey: key,
            tabOrderKeys: existingPane
              ? pane.tabOrderKeys
              : appendWorkspaceTabKey(pane.tabOrderKeys, key),
          })),
        };
      }

      if (request.kind === "commit-diff") {
        const key = commitDiffTabKey(request.commit.sha);
        const existingPane = existingPaneForCommit;
        const targetPaneId = existingPane?.id ?? resolveWorkspaceTargetPaneId(state);
        const nextTab = createCommitDiffTab(request.commit);
        const exists = state.documents.some((tab) => tab.key === key);

        return {
          ...state,
          activePaneId: targetPaneId,
          documents: exists
            ? state.documents.map((tab) => (tab.key === key ? nextTab : tab))
            : [...state.documents, nextTab],
          rootPane: updateWorkspacePane(state.rootPane, targetPaneId, (pane) => ({
            ...pane,
            activeTabKey: key,
            tabOrderKeys: existingPane
              ? pane.tabOrderKeys
              : appendWorkspaceTabKey(pane.tabOrderKeys, key),
          })),
        };
      }

      if (request.kind === "file-viewer") {
        const key = fileViewerTabKey(request.filePath);
        const existingPane = existingPaneForFile;
        const targetPaneId = existingPane?.id ?? resolveWorkspaceTargetPaneId(state);
        const nextTab = createFileViewerTab(request.filePath);
        const exists = state.documents.some((tab) => tab.key === key);

        return {
          ...state,
          activePaneId: targetPaneId,
          documents: exists
            ? state.documents.map((tab) => (tab.key === key ? nextTab : tab))
            : [...state.documents, nextTab],
          rootPane: updateWorkspacePane(state.rootPane, targetPaneId, (pane) => ({
            ...pane,
            activeTabKey: key,
            tabOrderKeys: existingPane
              ? pane.tabOrderKeys
              : appendWorkspaceTabKey(pane.tabOrderKeys, key),
          })),
        };
      }

      if (request.kind === "pull-request") {
        const key = pullRequestTabKey(request.pullRequest.number);
        const existingPane = existingPaneForPullRequest;
        const targetPaneId = existingPane?.id ?? resolveWorkspaceTargetPaneId(state);
        const nextTab = createPullRequestTab(request.pullRequest);
        const exists = state.documents.some((tab) => tab.key === key);

        return {
          ...state,
          activePaneId: targetPaneId,
          documents: exists
            ? state.documents.map((tab) => (tab.key === key ? nextTab : tab))
            : [...state.documents, nextTab],
          rootPane: updateWorkspacePane(state.rootPane, targetPaneId, (pane) => ({
            ...pane,
            activeTabKey: key,
            tabOrderKeys: existingPane
              ? pane.tabOrderKeys
              : appendWorkspaceTabKey(pane.tabOrderKeys, key),
          })),
        };
      }

      return state;
    }
    case "open-launcher": {
      return ensureWorkspacePaneLauncher(
        state,
        resolveWorkspaceTargetPaneId(state, action.paneId),
        action.launcherId,
      );
    }
    case "replace-launcher-with-tab": {
      const pane = findWorkspacePaneContainingTab(state.rootPane, action.launcherKey);
      const targetPaneId = pane?.id ?? resolveWorkspaceTargetPaneId(state);

      return {
        ...state,
        activePaneId: targetPaneId,
        documents: state.documents.filter((tab) => tab.key !== action.launcherKey),
        hiddenRuntimeTabKeys: removeWorkspaceTabKey(state.hiddenRuntimeTabKeys, action.tabKey),
        rootPane: updateWorkspacePane(state.rootPane, targetPaneId, (nextPane) => ({
          ...nextPane,
          activeTabKey:
            nextPane.activeTabKey === action.launcherKey ? action.tabKey : action.tabKey,
          tabOrderKeys: nextPane.tabOrderKeys.includes(action.launcherKey)
            ? nextPane.tabOrderKeys.map((key) => (key === action.launcherKey ? action.tabKey : key))
            : appendWorkspaceTabKey(nextPane.tabOrderKeys, action.tabKey),
        })),
      };
    }
    case "select-pane":
      return findWorkspacePaneById(state.rootPane, action.paneId)
        ? {
            ...state,
            activePaneId: action.paneId,
          }
        : state;
    case "select-tab":
    case "sync-pane-active":
      return selectWorkspacePaneTab(state, action.paneId, action.key);
    case "close-document": {
      const pane = findWorkspacePaneContainingTab(state.rootPane, action.key);
      if (!pane) {
        return {
          ...state,
          documents: state.documents.filter((tab) => tab.key !== action.key),
          viewStateByTabKey: omitWorkspaceTabViewState(state.viewStateByTabKey, action.key),
        };
      }

      const nextActiveKey =
        pane.activeTabKey === action.key
          ? getWorkspaceTabKeyAfterClose(pane.tabOrderKeys, action.key)
          : pane.activeTabKey;
      let nextState: WorkspaceSurfaceState = {
        ...state,
        documents: state.documents.filter((tab) => tab.key !== action.key),
        rootPane: updateWorkspacePane(state.rootPane, pane.id, (nextPane) => ({
          ...nextPane,
          activeTabKey: pane.activeTabKey === action.key ? nextActiveKey : nextPane.activeTabKey,
          tabOrderKeys: removeWorkspaceTabKey(nextPane.tabOrderKeys, action.key),
        })),
        viewStateByTabKey: omitWorkspaceTabViewState(state.viewStateByTabKey, action.key),
      };

      const nextPane = findWorkspacePaneById(nextState.rootPane, pane.id);
      if (!nextPane) {
        return nextState;
      }

      if (nextPane.tabOrderKeys.length === 0) {
        return ensureWorkspacePaneLauncher(
          nextState,
          pane.id,
          createWorkspaceLauncherId(),
          state.activePaneId === pane.id,
        );
      }

      if (state.activePaneId === pane.id && pane.activeTabKey === action.key) {
        return selectWorkspacePaneTab(nextState, pane.id, nextActiveKey);
      }

      return nextState;
    }
    case "hide-runtime-tab": {
      const pane = findWorkspacePaneContainingTab(state.rootPane, action.key);
      if (!pane) {
        return {
          ...state,
          hiddenRuntimeTabKeys: appendWorkspaceTabKey(state.hiddenRuntimeTabKeys, action.key),
          viewStateByTabKey: omitWorkspaceTabViewState(state.viewStateByTabKey, action.key),
        };
      }

      const nextActiveKey =
        pane.activeTabKey === action.key
          ? getWorkspaceTabKeyAfterClose(pane.tabOrderKeys, action.key)
          : pane.activeTabKey;
      let nextState: WorkspaceSurfaceState = {
        ...state,
        hiddenRuntimeTabKeys: appendWorkspaceTabKey(state.hiddenRuntimeTabKeys, action.key),
        rootPane: updateWorkspacePane(state.rootPane, pane.id, (nextPane) => ({
          ...nextPane,
          activeTabKey: pane.activeTabKey === action.key ? nextActiveKey : nextPane.activeTabKey,
          tabOrderKeys: removeWorkspaceTabKey(nextPane.tabOrderKeys, action.key),
        })),
        viewStateByTabKey: omitWorkspaceTabViewState(state.viewStateByTabKey, action.key),
      };

      const nextPane = findWorkspacePaneById(nextState.rootPane, pane.id);
      if (!nextPane) {
        return nextState;
      }

      if (nextPane.tabOrderKeys.length === 0) {
        return ensureWorkspacePaneLauncher(
          nextState,
          pane.id,
          createWorkspaceLauncherId(),
          state.activePaneId === pane.id,
        );
      }

      if (state.activePaneId === pane.id && pane.activeTabKey === action.key) {
        return selectWorkspacePaneTab(nextState, pane.id, nextActiveKey);
      }

      return nextState;
    }
    case "show-runtime-tab": {
      const existingPane = findWorkspacePaneContainingTab(state.rootPane, action.key);
      if (existingPane) {
        const nextState = {
          ...state,
          activePaneId: action.select ? existingPane.id : state.activePaneId,
          hiddenRuntimeTabKeys: removeWorkspaceTabKey(state.hiddenRuntimeTabKeys, action.key),
          rootPane: updateWorkspacePane(state.rootPane, existingPane.id, (pane) => ({
            ...pane,
            activeTabKey: action.select ? action.key : pane.activeTabKey,
          })),
        };

        return nextState;
      }

      const targetPaneId = resolveWorkspaceTargetPaneId(state, action.paneId);
      return {
        ...state,
        activePaneId: action.select ? targetPaneId : state.activePaneId,
        hiddenRuntimeTabKeys: removeWorkspaceTabKey(state.hiddenRuntimeTabKeys, action.key),
        rootPane: updateWorkspacePane(state.rootPane, targetPaneId, (pane) => ({
          ...pane,
          activeTabKey: action.select ? action.key : pane.activeTabKey,
          tabOrderKeys: appendWorkspaceTabKey(pane.tabOrderKeys, action.key),
        })),
      };
    }
    case "set-hidden-runtime-tab-keys": {
      return {
        ...state,
        rootPane: removeHiddenRuntimeTabsFromPaneTree(state.rootPane, new Set(action.keys)),
        hiddenRuntimeTabKeys: action.keys,
      };
    }
    case "set-pane-tab-order": {
      const pane = findWorkspacePaneById(state.rootPane, action.paneId);
      if (!pane) {
        return state;
      }

      const preservedKeys = pane.tabOrderKeys.filter((key) => !action.keys.includes(key));
      const nextKeys = appendWorkspaceTabKeys(action.keys, preservedKeys);
      if (areStringArraysEqual(pane.tabOrderKeys, nextKeys)) {
        return state;
      }

      return {
        ...state,
        rootPane: updateWorkspacePane(state.rootPane, action.paneId, (nextPane) => ({
          ...nextPane,
          tabOrderKeys: nextKeys,
        })),
      };
    }
    case "move-tab-to-pane": {
      if (action.sourcePaneId === action.targetPaneId) {
        return state;
      }

      const sourcePane = findWorkspacePaneById(state.rootPane, action.sourcePaneId);
      const targetPane = findWorkspacePaneById(state.rootPane, action.targetPaneId);
      if (!sourcePane || !targetPane || !sourcePane.tabOrderKeys.includes(action.key)) {
        return state;
      }

      const targetPlaceholderLauncherKeys = resolveWorkspacePanePlaceholderLauncherKeys(
        state,
        targetPane,
      );
      const nextDocuments =
        targetPlaceholderLauncherKeys.length === 0
          ? state.documents
          : state.documents.filter(
              (document) => !targetPlaceholderLauncherKeys.includes(document.key),
            );
      const nextSourceActiveKey =
        sourcePane.activeTabKey === action.key
          ? getWorkspaceTabKeyAfterClose(sourcePane.tabOrderKeys, action.key)
          : sourcePane.activeTabKey;
      const nextRootAfterSource = updateWorkspacePane(
        state.rootPane,
        sourcePane.id,
        (nextPane) => ({
          ...nextPane,
          activeTabKey: nextSourceActiveKey,
          tabOrderKeys: removeWorkspaceTabKey(nextPane.tabOrderKeys, action.key),
        }),
      );
      const nextRootPane = updateWorkspacePane(nextRootAfterSource, targetPane.id, (nextPane) => ({
        ...nextPane,
        activeTabKey: action.key,
        tabOrderKeys:
          action.targetKey && action.placement
            ? insertWorkspaceTabKey(
                nextPane.tabOrderKeys.filter((key) => !targetPlaceholderLauncherKeys.includes(key)),
                action.key,
                action.targetKey,
                action.placement,
              )
            : appendWorkspaceTabKey(
                nextPane.tabOrderKeys.filter((key) => !targetPlaceholderLauncherKeys.includes(key)),
                action.key,
              ),
      }));

      const nextState: WorkspaceSurfaceState = {
        ...state,
        activePaneId: targetPane.id,
        documents: nextDocuments,
        rootPane: nextRootPane,
      };

      const nextSourcePane = findWorkspacePaneById(nextState.rootPane, sourcePane.id);
      if (!nextSourcePane || nextSourcePane.tabOrderKeys.length > 0) {
        return nextState;
      }

      return ensureWorkspacePaneLauncher(
        nextState,
        sourcePane.id,
        createWorkspaceLauncherId(),
        false,
      );
    }
    case "set-tab-view-state": {
      const nextViewStateByTabKey =
        action.viewState === null
          ? omitWorkspaceTabViewState(state.viewStateByTabKey, action.key)
          : {
              ...state.viewStateByTabKey,
              [action.key]: action.viewState,
            };

      return nextViewStateByTabKey === state.viewStateByTabKey
        ? state
        : {
            ...state,
            viewStateByTabKey: nextViewStateByTabKey,
          };
    }
    case "split-pane": {
      const pane = findWorkspacePaneById(state.rootPane, action.paneId);
      if (!pane) {
        return state;
      }

      const launcher = createLauncherTab(action.launcherId);
      const nextPane: WorkspacePaneLeaf = {
        ...createWorkspacePane(action.newPaneId),
        activeTabKey: launcher.key,
        tabOrderKeys: [launcher.key],
      };

      return {
        ...state,
        activePaneId: nextPane.id,
        documents: [...state.documents, launcher],
        rootPane: splitWorkspacePane(state.rootPane, action.paneId, {
          direction: action.direction,
          first: action.placement === "before" ? nextPane : pane,
          id: action.splitId,
          kind: "split",
          ratio: 0.5,
          second: action.placement === "before" ? pane : nextPane,
        }),
      };
    }
    case "close-pane": {
      if (countWorkspacePanes(state.rootPane) <= 1) {
        return state;
      }

      const pane = findWorkspacePaneById(state.rootPane, action.paneId);
      if (!pane) {
        return state;
      }

      const closed = closeWorkspacePane(state.rootPane, action.paneId);
      if (!closed.siblingPaneId) {
        return state;
      }

      const nextRootPane = updateWorkspacePane(
        closed.nextRoot,
        closed.siblingPaneId,
        (sibling) => ({
          ...sibling,
          activeTabKey:
            state.activePaneId === action.paneId && pane.activeTabKey
              ? pane.activeTabKey
              : sibling.activeTabKey,
          tabOrderKeys: appendWorkspaceTabKeys(sibling.tabOrderKeys, pane.tabOrderKeys),
        }),
      );

      return {
        ...state,
        activePaneId:
          state.activePaneId === action.paneId ? closed.siblingPaneId : state.activePaneId,
        rootPane: nextRootPane,
      };
    }
    case "set-split-ratio":
      return {
        ...state,
        rootPane: updateWorkspaceSplit(state.rootPane, action.splitId, (split) => ({
          ...split,
          ratio: action.ratio,
        })),
      };
    default:
      return state;
  }
}

export function createInitialWorkspaceSurfaceState(workspaceId: string): WorkspaceSurfaceState {
  const restoredState = readWorkspaceSurfaceState(workspaceId);
  if (
    restoredState.documents.length > 0 ||
    collectWorkspacePaneLeaves(restoredState.rootPane).some(
      (pane) => pane.activeTabKey !== null || pane.tabOrderKeys.length > 0,
    )
  ) {
    return restoredState;
  }

  return workspaceSurfaceReducer(restoredState, {
    launcherId: createWorkspaceLauncherId(),
    kind: "open-launcher",
    paneId: getFirstWorkspacePane(restoredState.rootPane).id,
  });
}
