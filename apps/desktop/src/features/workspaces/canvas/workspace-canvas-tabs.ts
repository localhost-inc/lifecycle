import type { DragEvent as ReactDragEvent } from "react";
import {
  getWorkspaceTab,
  type WorkspaceCanvasTab,
  type WorkspaceCanvasTabsByKey,
} from "@/features/workspaces/state/workspace-canvas-state";
import { buildWorkspaceSurfaceTabPresentation } from "@/features/workspaces/surfaces/workspace-surface-registry";

export type { WorkspaceCanvasTab } from "@/features/workspaces/state/workspace-canvas-state";

export type WorkspaceTabPlacement = "after" | "before";

export interface WorkspaceTabClosePlan {
  nextActiveKey: string | null;
}

const NO_TAB_DRAG_SHIFT = 0 as const;

export function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function resolveWorkspaceVisibleTabs(
  tabsByKey: WorkspaceCanvasTabsByKey,
  tabOrderKeys: readonly string[],
): WorkspaceCanvasTab[] {
  return tabOrderKeys.reduce<WorkspaceCanvasTab[]>((visibleTabs, key) => {
    const tab = getWorkspaceTab(tabsByKey, key);
    if (tab) {
      visibleTabs.push(tab);
    }

    return visibleTabs;
  }, []);
}

export function getRightmostWorkspaceTabKey(
  tabs: readonly Pick<WorkspaceCanvasTab, "key">[],
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

export function tabTitle(tab: WorkspaceCanvasTab): string {
  return buildWorkspaceSurfaceTabPresentation(tab).title;
}

export function getTabDragPlacement(
  event: ReactDragEvent<HTMLElement>,
  element: HTMLElement,
): WorkspaceTabPlacement {
  const rect = element.getBoundingClientRect();
  return event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
}
