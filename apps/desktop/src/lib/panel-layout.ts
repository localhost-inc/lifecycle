export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PanelSizeBounds {
  maxSize: number;
  minSize: number;
}

export interface SplitRatioBounds {
  maxRatio: number;
  minRatio: number;
}

export const DASHBOARD_LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY =
  "lifecycle.desktop.dashboard-left-sidebar-collapsed";
export const DASHBOARD_LEFT_SIDEBAR_WIDTH_STORAGE_KEY =
  "lifecycle.desktop.dashboard-left-sidebar-width";
export const DASHBOARD_RIGHT_SIDEBAR_COLLAPSED_STORAGE_KEY =
  "lifecycle.desktop.dashboard-right-sidebar-collapsed";
export const DASHBOARD_RIGHT_SIDEBAR_WIDTH_STORAGE_KEY =
  "lifecycle.desktop.dashboard-right-sidebar-width";
export const PROJECT_SHELL_SIDEBAR_COLLAPSED_STORAGE_KEY =
  "lifecycle.desktop.project-shell-sidebar-collapsed";
export const PROJECT_SHELL_SIDEBAR_WIDTH_STORAGE_KEY =
  "lifecycle.desktop.project-shell-sidebar-width";

export const DEFAULT_LEFT_SIDEBAR_WIDTH = 256;
export const MIN_LEFT_SIDEBAR_WIDTH = 224;
export const MAX_LEFT_SIDEBAR_WIDTH = 420;

export const DEFAULT_WORKSPACE_EXTENSION_PANEL_WIDTH = 300;
export const MIN_WORKSPACE_EXTENSION_PANEL_WIDTH = 260;
export const MAX_WORKSPACE_EXTENSION_PANEL_WIDTH = 420;

export const MIN_DASHBOARD_MAIN_PANEL_WIDTH = 480;

export const DIFF_FILE_TREE_WIDTH_STORAGE_KEY = "lifecycle.desktop.diff-file-tree-width";
export const DEFAULT_DIFF_FILE_TREE_WIDTH = 240;
export const MIN_DIFF_FILE_TREE_WIDTH = 180;
export const MAX_DIFF_FILE_TREE_WIDTH = 360;

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function clampPanelSize(value: number, bounds: PanelSizeBounds): number {
  if (!Number.isFinite(value)) {
    return bounds.minSize;
  }

  return Math.min(bounds.maxSize, Math.max(bounds.minSize, value));
}

export function getSidebarWidthBounds({
  containerWidth,
  maxWidth,
  minCenterWidth = MIN_DASHBOARD_MAIN_PANEL_WIDTH,
  minWidth,
  oppositeSidebarWidth,
}: {
  containerWidth: number;
  maxWidth: number;
  minCenterWidth?: number;
  minWidth: number;
  oppositeSidebarWidth: number;
}): PanelSizeBounds {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return {
      maxSize: maxWidth,
      minSize: minWidth,
    };
  }

  const availableMaxWidth = containerWidth - oppositeSidebarWidth - minCenterWidth;

  return {
    maxSize: Math.min(maxWidth, Math.max(minWidth, availableMaxWidth)),
    minSize: minWidth,
  };
}

export function getLeftSidebarWidthFromPointer(
  pointerClientX: number,
  containerLeft: number,
  bounds: PanelSizeBounds,
): number {
  return clampPanelSize(pointerClientX - containerLeft, bounds);
}

export function getRightSidebarWidthFromPointer(
  pointerClientX: number,
  containerRight: number,
  bounds: PanelSizeBounds,
): number {
  return clampPanelSize(containerRight - pointerClientX, bounds);
}

export function getSplitRatioBounds(containerSize: number, minPanelSize: number): SplitRatioBounds {
  if (!Number.isFinite(containerSize) || containerSize <= 0) {
    return {
      maxRatio: 0.5,
      minRatio: 0.5,
    };
  }

  if (containerSize <= minPanelSize * 2) {
    return {
      maxRatio: 0.5,
      minRatio: 0.5,
    };
  }

  const minRatio = minPanelSize / containerSize;

  return {
    maxRatio: 1 - minRatio,
    minRatio,
  };
}

export function clampSplitRatio(value: number, bounds: SplitRatioBounds): number {
  if (!Number.isFinite(value)) {
    return bounds.minRatio;
  }

  return Math.min(bounds.maxRatio, Math.max(bounds.minRatio, value));
}

export function getVerticalSplitRatioFromPointer(
  pointerClientY: number,
  containerTop: number,
  containerHeight: number,
  minPanelSize: number,
): number {
  const bounds = getSplitRatioBounds(containerHeight, minPanelSize);
  if (bounds.minRatio === bounds.maxRatio) {
    return bounds.minRatio;
  }

  return clampSplitRatio((pointerClientY - containerTop) / containerHeight, bounds);
}

export function getHorizontalSplitRatioFromPointer(
  pointerClientX: number,
  containerLeft: number,
  containerWidth: number,
  minPanelSize: number,
): number {
  const bounds = getSplitRatioBounds(containerWidth, minPanelSize);
  if (bounds.minRatio === bounds.maxRatio) {
    return bounds.minRatio;
  }

  return clampSplitRatio((pointerClientX - containerLeft) / containerWidth, bounds);
}

export function readPersistedPanelValue(
  storageKey: string,
  defaultValue: number,
  storage: StorageLike | null = getBrowserStorage(),
): number {
  if (!storage) {
    return defaultValue;
  }

  const rawValue = storage.getItem(storageKey);
  if (rawValue === null) {
    return defaultValue;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : defaultValue;
}

export function writePersistedPanelValue(
  storageKey: string,
  value: number,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage || !Number.isFinite(value)) {
    return;
  }

  try {
    storage.setItem(storageKey, String(value));
  } catch {
    // Ignore local persistence failures; resize state is best-effort UI state.
  }
}
