import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  formatRegisteredShortcutLabel,
  type RegisteredShortcutId,
} from "@/app/shortcuts/shortcut-registry";

export const APP_HOTKEY_EVENT_NAME = "app:shortcut";

export type AppHotkeyAction =
  | "open-settings"
  | "open-command-palette"
  | "open-explorer"
  | "select-project-index";

export interface AppHotkeyEvent {
  action: AppHotkeyAction;
  index: number | null;
  source: "menu";
}

export interface AppHotkeyKeyEvent {
  altKey: boolean;
  code?: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

const APP_HOTKEY_SHORTCUT_ID_BY_ACTION: Record<AppHotkeyAction, RegisteredShortcutId> = {
  "open-command-palette": "app.open-command-palette",
  "open-explorer": "app.open-explorer",
  "open-settings": "app.open-settings",
  "select-project-index": "project.select-index",
};

const TAURI_MAC_MENU_APP_HOTKEYS = new Set<AppHotkeyAction>([
  "open-command-palette",
  "open-explorer",
  "open-settings",
  "select-project-index",
]);

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

export function readAppHotkeyAction(
  event: AppHotkeyKeyEvent,
  macPlatform: boolean,
): AppHotkeyAction | null {
  if (event.shiftKey || event.altKey) {
    return null;
  }

  const isComma = event.code === "Comma" || event.key === ",";
  const isK = event.code === "KeyK" || event.key === "k";
  const isP = event.code === "KeyP" || event.key === "p";
  const hasMod = macPlatform ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;

  if (!hasMod) {
    return null;
  }

  if (isComma) {
    return "open-settings";
  }

  if (isK) {
    return "open-command-palette";
  }

  if (isP) {
    return "open-explorer";
  }

  return null;
}

export function formatAppHotkeyLabel(action: AppHotkeyAction, macPlatform: boolean): string {
  return formatRegisteredShortcutLabel(APP_HOTKEY_SHORTCUT_ID_BY_ACTION[action], macPlatform);
}

export function shouldHandleDomAppHotkey(
  action: AppHotkeyAction,
  options: {
    isTauriApp: boolean;
    macPlatform: boolean;
  },
): boolean {
  return !(options.isTauriApp && options.macPlatform && TAURI_MAC_MENU_APP_HOTKEYS.has(action));
}

export async function subscribeToAppHotkeyEvents(
  callback: (event: AppHotkeyEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }

  return listen<AppHotkeyEvent>(APP_HOTKEY_EVENT_NAME, (event) => {
    callback(event.payload);
  });
}
