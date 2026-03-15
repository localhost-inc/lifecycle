export type RegisteredShortcutId =
  | "app.open-command-palette"
  | "app.open-file-picker"
  | "app.open-settings"
  | "file.save"
  | "overlay.close"
  | "project.go-back"
  | "project.go-forward"
  | "workspace.close-active-tab"
  | "workspace.new-tab"
  | "workspace.next-tab"
  | "workspace.previous-tab"
  | "workspace.select-tab-index";

export type RegisteredShortcutScope =
  | "app"
  | "file-surface"
  | "overlay-host"
  | "project-route"
  | "workspace-canvas";

export interface RegisteredShortcut {
  description: string;
  id: RegisteredShortcutId;
  mac: string;
  notes?: string;
  scope: RegisteredShortcutScope;
  windowsLinux: string;
}

export const REGISTERED_SHORTCUTS: readonly RegisteredShortcut[] = [
  {
    description: "Open settings",
    id: "app.open-settings",
    mac: "Cmd+,",
    scope: "app",
    windowsLinux: "Ctrl+,",
  },
  {
    description: "Open command palette",
    id: "app.open-command-palette",
    mac: "Cmd+K",
    scope: "app",
    windowsLinux: "Ctrl+K",
  },
  {
    description: "Open file picker",
    id: "app.open-file-picker",
    mac: "Cmd+P",
    scope: "app",
    windowsLinux: "Ctrl+P",
  },
  {
    description: "Go back in project tab history",
    id: "project.go-back",
    mac: "Cmd+[",
    scope: "project-route",
    windowsLinux: "Ctrl+[",
  },
  {
    description: "Go forward in project tab history",
    id: "project.go-forward",
    mac: "Cmd+]",
    scope: "project-route",
    windowsLinux: "Ctrl+]",
  },
  {
    description: "Create a new workspace terminal tab",
    id: "workspace.new-tab",
    mac: "Cmd+T",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+T",
  },
  {
    description: "Close the active workspace pane or project tab, depending on layout",
    id: "workspace.close-active-tab",
    mac: "Cmd+W",
    notes:
      "Also forwarded from the native terminal surface and intercepted from window-close on Tauri.",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+W",
  },
  {
    description: "Select the previous workspace tab",
    id: "workspace.previous-tab",
    mac: "Cmd+Shift+[",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+Shift+Tab",
  },
  {
    description: "Select the next workspace tab",
    id: "workspace.next-tab",
    mac: "Cmd+Shift+]",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+Tab",
  },
  {
    description: "Select workspace tab by visible index",
    id: "workspace.select-tab-index",
    mac: "Cmd+1..9",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+1..9",
  },
  {
    description: "Save the current file",
    id: "file.save",
    mac: "Cmd+S",
    scope: "file-surface",
    windowsLinux: "Ctrl+S",
  },
  {
    description: "Close the hosted overlay",
    id: "overlay.close",
    mac: "Escape",
    scope: "overlay-host",
    windowsLinux: "Escape",
  },
] as const;

const REGISTERED_SHORTCUTS_BY_ID = new Map(
  REGISTERED_SHORTCUTS.map((shortcut) => [shortcut.id, shortcut] as const),
);

export function getRegisteredShortcut(id: RegisteredShortcutId): RegisteredShortcut {
  const shortcut = REGISTERED_SHORTCUTS_BY_ID.get(id);
  if (!shortcut) {
    throw new Error(`Registered shortcut not found: ${id}`);
  }

  return shortcut;
}

export function formatRegisteredShortcutLabel(
  id: RegisteredShortcutId,
  macPlatform: boolean,
): string {
  const shortcut = getRegisteredShortcut(id);
  return macPlatform ? shortcut.mac : shortcut.windowsLinux;
}

export function listRegisteredShortcutsForScope(
  scope: RegisteredShortcutScope,
): RegisteredShortcut[] {
  return REGISTERED_SHORTCUTS.filter((shortcut) => shortcut.scope === scope);
}
