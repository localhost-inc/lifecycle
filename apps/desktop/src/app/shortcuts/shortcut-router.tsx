import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { readFileSaveHotkey } from "@/features/editor/lib/file-editor-renderers";
import { readWorkspaceTabHotkeyAction } from "@/features/workspaces/canvas/workspace-canvas-shortcuts";
import { isEditableTarget, isMacPlatform, readAppHotkeyAction } from "@/app/app-hotkeys";
import type { RegisteredShortcutId } from "@/app/shortcuts/shortcut-registry";

export const SHORTCUT_HANDLER_PRIORITY = {
  app: 0,
  repository: 10,
  workspace: 20,
  file: 30,
} as const;

export type PaneDirection = "down" | "left" | "right" | "up";

export interface ShortcutMatch {
  direction?: PaneDirection;
  id: RegisteredShortcutId;
  index?: number;
}

export interface ShortcutRegistration {
  allowInEditable?: boolean;
  enabled?: boolean;
  handler: (match: ShortcutMatch, event: ShortcutRouterKeyEvent) => boolean | void;
  id: RegisteredShortcutId;
  priority?: number;
}

export interface ShortcutDispatchRegistration extends ShortcutRegistration {
  order: number;
}

type ShortcutRegistrar = (registration: ShortcutRegistration) => () => void;

export type ShortcutRouterKeyEvent = Pick<
  KeyboardEvent,
  | "altKey"
  | "code"
  | "ctrlKey"
  | "defaultPrevented"
  | "key"
  | "metaKey"
  | "preventDefault"
  | "shiftKey"
  | "target"
>;

const ShortcutRouterContext = createContext<ShortcutRegistrar | null>(null);

function readRepositoryRouteShortcutMatch(
  shortcutId: RegisteredShortcutId,
  event: ShortcutRouterKeyEvent,
  macPlatform: boolean,
): ShortcutMatch | null {
  const hasMod = macPlatform ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const isBracketLeft = event.code === "BracketLeft" || event.key === "[" || event.key === "{";
  const isBracketRight = event.code === "BracketRight" || event.key === "]" || event.key === "}";

  // Cmd+[ / Cmd+] (no shift) — history navigation
  if (!event.altKey && !event.shiftKey && hasMod) {
    if (shortcutId === "repository.go-back" && isBracketLeft) {
      return { id: shortcutId };
    }

    if (shortcutId === "repository.go-forward" && isBracketRight) {
      return { id: shortcutId };
    }
  }

  // Cmd+Shift+[ / Cmd+Shift+] — workspace navigation
  if (!event.altKey && event.shiftKey && hasMod) {
    if (shortcutId === "workspace.previous-workspace" && isBracketLeft) {
      return { id: shortcutId };
    }

    if (shortcutId === "workspace.next-workspace" && isBracketRight) {
      return { id: shortcutId };
    }
  }

  return null;
}

function readRepositorySelectIndexMatch(
  event: ShortcutRouterKeyEvent,
  macPlatform: boolean,
): ShortcutMatch | null {
  if (event.altKey || event.shiftKey) {
    return null;
  }

  const hasMod = macPlatform ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!hasMod) {
    return null;
  }

  const lowerKey = event.key.toLowerCase();
  if (lowerKey >= "1" && lowerKey <= "9") {
    return { id: "repository.select-index", index: Number.parseInt(lowerKey, 10) };
  }

  return null;
}

function readFocusPaneMatch(
  event: ShortcutRouterKeyEvent,
  macPlatform: boolean,
): ShortcutMatch | null {
  if (event.shiftKey) {
    return null;
  }

  const hasMod = macPlatform
    ? event.metaKey && event.ctrlKey && !event.altKey
    : event.ctrlKey && event.altKey && !event.metaKey;
  if (!hasMod) {
    return null;
  }

  const directionByKey: Record<string, PaneDirection> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };

  const direction = directionByKey[event.key];
  if (!direction) {
    return null;
  }

  return { direction, id: "canvas.pane.focus" };
}

function readToggleZoomMatch(
  event: ShortcutRouterKeyEvent,
  macPlatform: boolean,
): ShortcutMatch | null {
  if (!event.shiftKey || event.altKey) {
    return null;
  }

  const hasMod = macPlatform ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!hasMod) {
    return null;
  }

  if (event.key === "Enter") {
    return { id: "canvas.pane.tab.zoom.toggle" };
  }

  return null;
}

export function readRegisteredShortcutMatch(
  shortcutId: RegisteredShortcutId,
  event: ShortcutRouterKeyEvent,
  macPlatform: boolean,
): ShortcutMatch | null {
  switch (shortcutId) {
    case "app.open-settings":
      return readAppHotkeyAction(event, macPlatform) === "open-settings"
        ? { id: shortcutId }
        : null;
    case "app.open-command-palette":
      return readAppHotkeyAction(event, macPlatform) === "open-command-palette"
        ? { id: shortcutId }
        : null;
    case "app.open-explorer":
      return readAppHotkeyAction(event, macPlatform) === "open-explorer"
        ? { id: shortcutId }
        : null;
    case "repository.go-back":
    case "repository.go-forward":
    case "workspace.previous-workspace":
    case "workspace.next-workspace":
      return readRepositoryRouteShortcutMatch(shortcutId, event, macPlatform);
    case "repository.select-index":
      return readRepositorySelectIndexMatch(event, macPlatform);
    case "canvas.pane.tab.open":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.id === "canvas.pane.tab.open"
        ? { id: shortcutId }
        : null;
    case "canvas.pane.tab.close":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.id === "canvas.pane.tab.close"
        ? { id: shortcutId }
        : null;
    case "canvas.pane.tab.select.previous":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.id ===
        "canvas.pane.tab.select.previous"
        ? { id: shortcutId }
        : null;
    case "canvas.pane.tab.select.next":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.id === "canvas.pane.tab.select.next"
        ? { id: shortcutId }
        : null;
    case "canvas.tab.reopen":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.id === "canvas.tab.reopen"
        ? { id: shortcutId }
        : null;
    case "canvas.pane.focus":
      return readFocusPaneMatch(event, macPlatform);
    case "canvas.pane.tab.zoom.toggle":
      return readToggleZoomMatch(event, macPlatform);
    case "file.save":
      return readFileSaveHotkey(event, macPlatform) ? { id: shortcutId } : null;
    default:
      return null;
  }
}

function compareShortcutRegistrations(
  left: ShortcutDispatchRegistration,
  right: ShortcutDispatchRegistration,
): number {
  const leftPriority = left.priority ?? 0;
  const rightPriority = right.priority ?? 0;
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }

  return right.order - left.order;
}

export function dispatchRegisteredShortcutEvent({
  event,
  macPlatform,
  registrations,
}: {
  event: ShortcutRouterKeyEvent;
  macPlatform: boolean;
  registrations: readonly ShortcutDispatchRegistration[];
}): ShortcutMatch | null {
  if (event.defaultPrevented) {
    return null;
  }

  const orderedRegistrations = [...registrations].sort(compareShortcutRegistrations);
  for (const registration of orderedRegistrations) {
    if (registration.enabled === false) {
      continue;
    }

    if (
      !registration.allowInEditable &&
      typeof HTMLElement !== "undefined" &&
      isEditableTarget(event.target ?? null)
    ) {
      continue;
    }

    const match = readRegisteredShortcutMatch(registration.id, event, macPlatform);
    if (!match) {
      continue;
    }

    if (registration.handler(match, event) === false) {
      continue;
    }

    event.preventDefault?.();
    return match;
  }

  return null;
}

export function ShortcutRouterProvider({ children }: { children: ReactNode }) {
  const registrationsRef = useRef<Map<number, ShortcutDispatchRegistration>>(new Map());
  const nextOrderRef = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      dispatchRegisteredShortcutEvent({
        event,
        macPlatform: isMacPlatform(),
        registrations: [...registrationsRef.current.values()],
      });
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const register = useRef<ShortcutRegistrar>((registration) => {
    const order = nextOrderRef.current++;
    registrationsRef.current.set(order, {
      ...registration,
      order,
    });

    return () => {
      registrationsRef.current.delete(order);
    };
  });

  return (
    <ShortcutRouterContext.Provider value={register.current}>
      {children}
    </ShortcutRouterContext.Provider>
  );
}

export function useShortcutRegistration(registration: ShortcutRegistration): void {
  const register = useContext(ShortcutRouterContext);
  const { allowInEditable, enabled, handler, id, priority } = registration;

  useEffect(() => {
    if (!register) {
      return;
    }

    return register({
      allowInEditable,
      enabled,
      handler,
      id,
      priority,
    });
  }, [allowInEditable, enabled, handler, id, priority, register]);
}
