import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type WorkspaceShortcutAction =
  | "close-active-tab"
  | "new-tab"
  | "next-tab"
  | "previous-tab";

export interface WorkspaceShortcutEvent {
  action: WorkspaceShortcutAction;
  index: number | null;
  source_surface_id: string | null;
  source_surface_kind: "native-terminal" | null;
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
