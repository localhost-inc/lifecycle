import type { StorageLike } from "../../lib/panel-layout";

export interface ExtensionBarState {
  activeExtensionId: string | null;
  panelWidth: number;
}

export const WORKSPACE_EXTENSION_PANEL_WIDTH_STORAGE_KEY =
  "lifecycle.desktop.workspace-extension-panel-width";

const WORKSPACE_ACTIVE_EXTENSION_STORAGE_KEY_PREFIX =
  "lifecycle.desktop.workspace-extension-active";
const WORKSPACE_EXTENSION_PREFERENCE_STORAGE_KEY_PREFIX =
  "lifecycle.desktop.workspace-extension-preference";

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function getWorkspaceActiveExtensionStorageKey(workspaceId: string): string {
  return `${WORKSPACE_ACTIVE_EXTENSION_STORAGE_KEY_PREFIX}:${workspaceId}`;
}

function getWorkspaceExtensionPreferenceStorageKey(workspaceId: string, key: string): string {
  return `${WORKSPACE_EXTENSION_PREFERENCE_STORAGE_KEY_PREFIX}:${workspaceId}:${key}`;
}

export function toggleActiveExtension(
  currentExtensionId: string | null,
  nextExtensionId: string,
): string | null {
  return currentExtensionId === nextExtensionId ? null : nextExtensionId;
}

export function readPersistedActiveExtensionId(
  workspaceId: string,
  storage: StorageLike | null = getBrowserStorage(),
): string | null {
  if (!storage) {
    return null;
  }

  const value = storage.getItem(getWorkspaceActiveExtensionStorageKey(workspaceId));
  return value && value.trim().length > 0 ? value : null;
}

export function writePersistedActiveExtensionId(
  workspaceId: string,
  extensionId: string | null,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) {
    return;
  }

  const storageKey = getWorkspaceActiveExtensionStorageKey(workspaceId);
  try {
    if (extensionId === null) {
      storage.setItem(storageKey, "");
      return;
    }

    storage.setItem(storageKey, extensionId);
  } catch {
    // best-effort UI persistence
  }
}

export function readPersistedExtensionPreference(
  workspaceId: string,
  key: string,
  defaultValue: string,
  storage: StorageLike | null = getBrowserStorage(),
): string {
  if (!storage) {
    return defaultValue;
  }

  const value = storage.getItem(getWorkspaceExtensionPreferenceStorageKey(workspaceId, key));
  return value && value.trim().length > 0 ? value : defaultValue;
}

export function writePersistedExtensionPreference(
  workspaceId: string,
  key: string,
  value: string,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(getWorkspaceExtensionPreferenceStorageKey(workspaceId, key), value);
  } catch {
    // best-effort UI persistence
  }
}
