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
  | { id: "canvas.pane.tab.close" }
  | { id: "canvas.pane.tab.open" }
  | { id: "canvas.pane.tab.select.next" }
  | { id: "canvas.pane.tab.select.previous" }
  | { id: "canvas.tab.reopen" };

export type WorkspaceCloseShortcutTarget = "close-pane" | "close-repository-tab" | null;

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
        return { id: "canvas.tab.reopen" };
      }

      if (!event.shiftKey && lowerKey === "t") {
        return { id: "canvas.pane.tab.open" };
      }

      if (!event.shiftKey && lowerKey === "w") {
        return { id: "canvas.pane.tab.close" };
      }
    }
  } else {
    if (event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.shiftKey && lowerKey === "t") {
        return { id: "canvas.tab.reopen" };
      }

      if (!event.shiftKey && lowerKey === "t") {
        return { id: "canvas.pane.tab.open" };
      }

      if (!event.shiftKey && lowerKey === "w") {
        return { id: "canvas.pane.tab.close" };
      }
    }
  }

  // Ctrl+Tab / Ctrl+Shift+Tab — tab cycling (same on all platforms)
  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Tab") {
    return event.shiftKey
      ? { id: "canvas.pane.tab.select.previous" }
      : { id: "canvas.pane.tab.select.next" };
  }

  return null;
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

  return paneCount > 1 ? "close-pane" : "close-repository-tab";
}
