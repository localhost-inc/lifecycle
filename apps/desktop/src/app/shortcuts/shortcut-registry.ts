export type RegisteredShortcutId =
  | "app.open-command-palette"
  | "app.open-explorer"
  | "app.open-settings"
  | "file.save"
  | "project.go-back"
  | "project.go-forward"
  | "project.select-index"
  | "workspace.close-active-tab"
  | "workspace.focus-pane"
  | "workspace.new-tab"
  | "workspace.next-tab"
  | "workspace.next-workspace"
  | "workspace.previous-tab"
  | "workspace.previous-workspace"
  | "workspace.reopen-closed-tab"
  | "workspace.toggle-zoom";

export type RegisteredShortcutScope = "app" | "file-surface" | "project-route" | "workspace-canvas";

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
    description: "Open explorer",
    id: "app.open-explorer",
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
    description: "Select project by sidebar index",
    id: "project.select-index",
    mac: "Cmd+1..9",
    scope: "app",
    windowsLinux: "Ctrl+1..9",
  },
  {
    description: "Switch to the previous workspace",
    id: "workspace.previous-workspace",
    mac: "Cmd+Shift+[",
    scope: "project-route",
    windowsLinux: "Ctrl+Shift+[",
  },
  {
    description: "Switch to the next workspace",
    id: "workspace.next-workspace",
    mac: "Cmd+Shift+]",
    scope: "project-route",
    windowsLinux: "Ctrl+Shift+]",
  },
  {
    description: "Select the previous pane tab",
    id: "workspace.previous-tab",
    mac: "Ctrl+Shift+Tab",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+Shift+Tab",
  },
  {
    description: "Select the next pane tab",
    id: "workspace.next-tab",
    mac: "Ctrl+Tab",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+Tab",
  },
  {
    description: "Move focus to an adjacent pane",
    id: "workspace.focus-pane",
    mac: "Cmd+Ctrl+Arrows",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+Alt+Arrows",
  },
  {
    description: "Reopen the last closed document tab",
    id: "workspace.reopen-closed-tab",
    mac: "Cmd+Shift+T",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+Shift+T",
  },
  {
    description: "Toggle zoom on the active pane tab",
    id: "workspace.toggle-zoom",
    mac: "Cmd+Shift+Enter",
    scope: "workspace-canvas",
    windowsLinux: "Ctrl+Shift+Enter",
  },
  {
    description: "Save the current file",
    id: "file.save",
    mac: "Cmd+S",
    scope: "file-surface",
    windowsLinux: "Ctrl+S",
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
