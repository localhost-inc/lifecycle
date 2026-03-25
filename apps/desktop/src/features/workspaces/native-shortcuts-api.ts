import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type WorkspaceShortcutAction =
  | "workspace.go-back"
  | "workspace.go-forward"
  | "canvas.pane.tab.close"
  | "canvas.pane.tab.open"
  | "canvas.pane.tab.select.next"
  | "canvas.pane.tab.select.previous"
  | "canvas.pane.tab.zoom.toggle"
  | "canvas.tab.reopen";

export interface WorkspaceShortcutEvent {
  action: WorkspaceShortcutAction;
  index: number | null;
  source_surface_id: string | null;
  source_surface_kind: null;
}

export async function subscribeToNativeWorkspaceShortcutEvents(
  callback: (event: WorkspaceShortcutEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }

  return listen<WorkspaceShortcutEvent>("native-workspace:shortcut", (event) => {
    callback(event.payload);
  });
}
