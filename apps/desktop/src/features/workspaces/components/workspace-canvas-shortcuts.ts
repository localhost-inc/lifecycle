import type { WorkspaceShortcutEvent } from "../native-shortcuts-api";

export const WORKSPACE_CLOSE_SHORTCUT_GRACE_MS = 250;

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
  | { kind: "reopen-closed-tab" };

export type WorkspaceCloseShortcutTarget = "close-pane" | "close-project-tab" | null;

export function releaseWebviewFocus(): void {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
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

export function readWorkspaceTabHotkeyAction(
  event: WorkspaceTabHotkeyEvent,
  macPlatform: boolean,
): WorkspaceTabHotkeyAction | null {
  const lowerKey = event.key.toLowerCase();

  // Cmd+T / Cmd+W / Cmd+Shift+T (mac) or Ctrl+T / Ctrl+W / Ctrl+Shift+T (non-mac)
  if (macPlatform) {
    if (event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.shiftKey && lowerKey === "t") {
        return { kind: "reopen-closed-tab" };
      }

      if (!event.shiftKey && lowerKey === "t") {
        return { kind: "new-tab" };
      }

      if (!event.shiftKey && lowerKey === "w") {
        return { kind: "close-active-tab" };
      }
    }
  } else {
    if (event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.shiftKey && lowerKey === "t") {
        return { kind: "reopen-closed-tab" };
      }

      if (!event.shiftKey && lowerKey === "t") {
        return { kind: "new-tab" };
      }

      if (!event.shiftKey && lowerKey === "w") {
        return { kind: "close-active-tab" };
      }
    }
  }

  // Ctrl+Tab / Ctrl+Shift+Tab — tab cycling (same on all platforms)
  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Tab") {
    return event.shiftKey ? { kind: "previous-tab" } : { kind: "next-tab" };
  }

  return null;
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
    case "reopen-closed-tab":
      return { kind: "reopen-closed-tab" };
    default:
      return null;
  }
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

export function resolveWorkspaceCloseShortcutTarget(
  paneCount: number,
  activePaneTabCount: number = 0,
): WorkspaceCloseShortcutTarget {
  if (!Number.isFinite(paneCount) || paneCount <= 0) {
    return null;
  }

  if (activePaneTabCount > 0) {
    return null;
  }

  return paneCount > 1 ? "close-pane" : "close-project-tab";
}
