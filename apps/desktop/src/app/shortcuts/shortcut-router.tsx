import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { readFileSaveHotkey } from "../../features/files/lib/file-renderers";
import { readWorkspaceTabHotkeyAction } from "../../features/workspaces/components/workspace-canvas-shortcuts";
import { isEditableTarget, isMacPlatform, readAppHotkeyAction } from "../app-hotkeys";
import type { RegisteredShortcutId } from "./shortcut-registry";

export const SHORTCUT_HANDLER_PRIORITY = {
  app: 0,
  project: 10,
  workspace: 20,
  file: 30,
  overlay: 40,
} as const;

export interface ShortcutMatch {
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

function readProjectRouteShortcutMatch(
  shortcutId: RegisteredShortcutId,
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

  const isBracketLeft = event.code === "BracketLeft" || event.key === "[";
  if (shortcutId === "project.go-back" && isBracketLeft) {
    return { id: shortcutId };
  }

  const isBracketRight = event.code === "BracketRight" || event.key === "]";
  if (shortcutId === "project.go-forward" && isBracketRight) {
    return { id: shortcutId };
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
    case "app.open-file-picker":
      return readAppHotkeyAction(event, macPlatform) === "open-file-picker"
        ? { id: shortcutId }
        : null;
    case "project.go-back":
    case "project.go-forward":
      return readProjectRouteShortcutMatch(shortcutId, event, macPlatform);
    case "workspace.new-tab":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.kind === "new-tab"
        ? { id: shortcutId }
        : null;
    case "workspace.close-active-tab":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.kind === "close-active-tab"
        ? { id: shortcutId }
        : null;
    case "workspace.previous-tab":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.kind === "previous-tab"
        ? { id: shortcutId }
        : null;
    case "workspace.next-tab":
      return readWorkspaceTabHotkeyAction(event, macPlatform)?.kind === "next-tab"
        ? { id: shortcutId }
        : null;
    case "workspace.select-tab-index": {
      const action = readWorkspaceTabHotkeyAction(event, macPlatform);
      return action?.kind === "select-tab-index" ? { id: shortcutId, index: action.index } : null;
    }
    case "file.save":
      return readFileSaveHotkey(event, macPlatform) ? { id: shortcutId } : null;
    case "overlay.close":
      return event.key === "Escape" || event.key === "Esc" ? { id: shortcutId } : null;
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
