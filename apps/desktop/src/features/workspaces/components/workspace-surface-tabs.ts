import type { DragEvent as ReactDragEvent } from "react";
import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import type { HarnessProvider } from "../../terminals/api";
import {
  getWorkspaceDocument,
  isChangesDiffDocument,
  isCommitDiffDocument,
  isFileViewerDocument,
  isPullRequestDocument,
  type WorkspaceSurfaceDocument,
  type WorkspaceSurfaceDocumentsByKey,
} from "../state/workspace-surface-state";

export type RuntimeTab = {
  harnessProvider: HarnessProvider | null;
  kind: "terminal";
  key: string;
  label: string;
  launchType: TerminalRecord["launch_type"];
  responseReady: boolean;
  running?: boolean;
  status: TerminalStatus;
  terminalId: string;
};

export type WorkspaceSurfaceTab = RuntimeTab | WorkspaceSurfaceDocument;

export type WorkspaceTabPlacement = "after" | "before";

export interface WorkspaceTabClosePlan {
  nextActiveKey: string | null;
}

const NO_TAB_DRAG_SHIFT = 0 as const;

export function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function orderWorkspaceTerminals(terminals: readonly TerminalRecord[]): TerminalRecord[] {
  return [...terminals].sort(
    (left, right) =>
      left.started_at.localeCompare(right.started_at) || left.id.localeCompare(right.id),
  );
}

export function resolveWorkspaceVisibleTabs(
  runtimeTabs: readonly RuntimeTab[],
  documentsByKey: WorkspaceSurfaceDocumentsByKey,
  tabOrderKeys: readonly string[],
  hiddenRuntimeTabKeys: readonly string[],
): WorkspaceSurfaceTab[] {
  const hiddenRuntimeTabKeySet = new Set(hiddenRuntimeTabKeys);
  const runtimeTabsByKey = new Map(runtimeTabs.map((tab) => [tab.key, tab]));

  return tabOrderKeys.reduce<WorkspaceSurfaceTab[]>((visibleTabs, key) => {
    if (hiddenRuntimeTabKeySet.has(key)) {
      return visibleTabs;
    }

    const runtimeTab = runtimeTabsByKey.get(key);
    if (runtimeTab) {
      visibleTabs.push(runtimeTab);
      return visibleTabs;
    }

    const document = getWorkspaceDocument(documentsByKey, key);
    if (document) {
      visibleTabs.push(document);
    }

    return visibleTabs;
  }, []);
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
): WorkspaceTabClosePlan {
  return {
    nextActiveKey: getWorkspaceTabKeyAfterClose(tabKeys, closedKey),
  };
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

  return "";
}

export function getTabDragPlacement(
  event: ReactDragEvent<HTMLElement>,
  element: HTMLElement,
): WorkspaceTabPlacement {
  const rect = element.getBoundingClientRect();
  return event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
}
