import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const APP_HOTKEY_EVENT_NAME = "app:shortcut";

export type AppHotkeyAction = "open-settings" | "open-command-palette";

export interface AppHotkeyEvent {
  action: AppHotkeyAction;
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
  const hasMod = macPlatform
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;

  if (!hasMod) {
    return null;
  }

  if (isComma) {
    return "open-settings";
  }

  if (isK) {
    return "open-command-palette";
  }

  return null;
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
