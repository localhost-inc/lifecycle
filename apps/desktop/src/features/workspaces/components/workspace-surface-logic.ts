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
  isPullRequestDocument,
  readWorkspaceSurfaceState,
  pullRequestTabKey,
  type ChangesDiffDocument,
  type WorkspaceSurfaceDocument,
  type WorkspaceSurfaceState,
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
  | { kind: "open-launcher"; launcherId: string }
  | { kind: "replace-launcher-with-tab"; launcherKey: string; tabKey: string }
  | { kind: "select-tab"; key: string | null }
  | { kind: "close-document"; key: string; nextActiveKey: string | null }
  | { kind: "hide-runtime-tab"; key: string; nextActiveKey: string | null }
  | { kind: "show-runtime-tab"; key: string; select: boolean }
  | { kind: "set-hidden-runtime-tab-keys"; keys: string[] }
  | { kind: "set-tab-order"; keys: string[] }
  | { kind: "sync-active"; key: string | null };

function appendWorkspaceTabKey(keys: readonly string[], key: string): string[] {
  return [...keys.filter((existingKey) => existingKey !== key), key];
}

function removeWorkspaceTabKey(keys: readonly string[], key: string): string[] {
  return keys.filter((existingKey) => existingKey !== key);
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

  return orderWorkspaceTabs(
    [...runtimeTabs.filter((tab) => !hiddenRuntimeTabKeySet.has(tab.key)), ...documents],
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

      if (request.kind === "changes-diff") {
        const key = changesDiffTabKey();
        const existing = state.documents.find(
          (tab): tab is ChangesDiffDocument => isChangesDiffDocument(tab) && tab.key === key,
        );

        if (existing) {
          return {
            ...state,
            activeTabKey: key,
            documents: state.documents.map((tab) =>
              tab.key === key && isChangesDiffDocument(tab)
                ? { ...tab, focusPath: request.focusPath }
                : tab,
            ),
            tabOrderKeys: state.tabOrderKeys.includes(key)
              ? state.tabOrderKeys
              : appendWorkspaceTabKey(state.tabOrderKeys, key),
          };
        }

        return {
          ...state,
          activeTabKey: key,
          documents: [...state.documents, createChangesDiffTab(request.focusPath)],
          tabOrderKeys: appendWorkspaceTabKey(state.tabOrderKeys, key),
        };
      }

      if (request.kind === "commit-diff") {
        const key = commitDiffTabKey(request.commit.sha);
        const nextTab = createCommitDiffTab(request.commit);
        const exists = state.documents.some((tab) => tab.key === key);

        return {
          ...state,
          activeTabKey: key,
          documents: exists
            ? state.documents.map((tab) => (tab.key === key ? nextTab : tab))
            : [...state.documents, nextTab],
          tabOrderKeys: exists
            ? state.tabOrderKeys
            : appendWorkspaceTabKey(state.tabOrderKeys, key),
        };
      }

      if (request.kind === "file-viewer") {
        const key = fileViewerTabKey(request.filePath);
        const nextTab = createFileViewerTab(request.filePath);
        const exists = state.documents.some((tab) => tab.key === key);

        return {
          ...state,
          activeTabKey: key,
          documents: exists
            ? state.documents.map((tab) => (tab.key === key ? nextTab : tab))
            : [...state.documents, nextTab],
          tabOrderKeys: exists
            ? state.tabOrderKeys
            : appendWorkspaceTabKey(state.tabOrderKeys, key),
        };
      }

      if (request.kind === "pull-request") {
        const key = pullRequestTabKey(request.pullRequest.number);
        const nextTab = createPullRequestTab(request.pullRequest);
        const exists = state.documents.some((tab) => tab.key === key);

        return {
          ...state,
          activeTabKey: key,
          documents: exists
            ? state.documents.map((tab) => (tab.key === key ? nextTab : tab))
            : [...state.documents, nextTab],
          tabOrderKeys: exists
            ? state.tabOrderKeys
            : appendWorkspaceTabKey(state.tabOrderKeys, key),
        };
      }

      return state;
    }
    case "open-launcher": {
      const launcher = createLauncherTab(action.launcherId);
      return {
        ...state,
        activeTabKey: launcher.key,
        documents: [...state.documents, launcher],
        tabOrderKeys: appendWorkspaceTabKey(state.tabOrderKeys, launcher.key),
      };
    }
    case "replace-launcher-with-tab": {
      const tabOrderKeys = state.tabOrderKeys.includes(action.launcherKey)
        ? state.tabOrderKeys.map((key) => (key === action.launcherKey ? action.tabKey : key))
        : appendWorkspaceTabKey(state.tabOrderKeys, action.tabKey);

      return {
        ...state,
        activeTabKey:
          state.activeTabKey === action.launcherKey ? action.tabKey : state.activeTabKey,
        documents: state.documents.filter((tab) => tab.key !== action.launcherKey),
        hiddenRuntimeTabKeys: removeWorkspaceTabKey(state.hiddenRuntimeTabKeys, action.tabKey),
        tabOrderKeys,
      };
    }
    case "select-tab":
    case "sync-active":
      return {
        ...state,
        activeTabKey: action.key,
      };
    case "close-document":
      return {
        ...state,
        activeTabKey: action.nextActiveKey,
        documents: state.documents.filter((tab) => tab.key !== action.key),
        tabOrderKeys: removeWorkspaceTabKey(state.tabOrderKeys, action.key),
      };
    case "hide-runtime-tab":
      return {
        ...state,
        activeTabKey: action.nextActiveKey,
        hiddenRuntimeTabKeys: appendWorkspaceTabKey(state.hiddenRuntimeTabKeys, action.key),
        tabOrderKeys: removeWorkspaceTabKey(state.tabOrderKeys, action.key),
      };
    case "show-runtime-tab":
      return {
        ...state,
        activeTabKey: action.select ? action.key : state.activeTabKey,
        hiddenRuntimeTabKeys: removeWorkspaceTabKey(state.hiddenRuntimeTabKeys, action.key),
        tabOrderKeys: appendWorkspaceTabKey(state.tabOrderKeys, action.key),
      };
    case "set-hidden-runtime-tab-keys": {
      const activeTabKey =
        state.activeTabKey && action.keys.includes(state.activeTabKey) ? null : state.activeTabKey;

      return {
        ...state,
        activeTabKey,
        hiddenRuntimeTabKeys: action.keys,
      };
    }
    case "set-tab-order":
      return areStringArraysEqual(state.tabOrderKeys, action.keys)
        ? state
        : { ...state, tabOrderKeys: action.keys };
    default:
      return state;
  }
}

export function createInitialWorkspaceSurfaceState(workspaceId: string): WorkspaceSurfaceState {
  const restoredState = readWorkspaceSurfaceState(workspaceId);
  if (
    restoredState.activeTabKey !== null ||
    restoredState.documents.length > 0 ||
    restoredState.tabOrderKeys.length > 0
  ) {
    return restoredState;
  }

  return workspaceSurfaceReducer(restoredState, {
    launcherId: createWorkspaceLauncherId(),
    kind: "open-launcher",
  });
}
