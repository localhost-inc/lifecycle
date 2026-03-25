import { isTauri } from "@tauri-apps/api/core";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { isMacPlatform } from "@/app/app-hotkeys";
import { isRootWorkspace } from "@/features/workspaces/lib/workspace-display";
import {
  listAvailableOpenInTargets,
  resolveDefaultOpenTarget,
} from "@/features/workspaces/lib/open-in-targets";
import { openWorkspaceInApp } from "@/features/workspaces/open-in-api";
import type { WorkspaceCreateMode } from "@/features/workspaces/api";

export async function showWorkspaceContextMenu(
  workspace: WorkspaceRecord,
  callbacks: {
    onArchiveWorkspace: (workspace: WorkspaceRecord) => void;
  },
): Promise<void> {
  const openInEditorItem = await MenuItem.new({
    id: "open-in-editor",
    text: "Open in Editor",
    action: () => {
      const target = resolveDefaultOpenTarget(listAvailableOpenInTargets(isMacPlatform()));
      void openWorkspaceInApp(workspace.id, target.id);
    },
  });

  const items: (MenuItem | PredefinedMenuItem)[] = [openInEditorItem];

  if (!isRootWorkspace(workspace)) {
    const separator = await PredefinedMenuItem.new({ item: "Separator" });
    const archiveItem = await MenuItem.new({
      id: "archive-workspace",
      text: "Archive Workspace",
      action: () => callbacks.onArchiveWorkspace(workspace),
    });
    items.push(separator, archiveItem);
  }

  const menu = await Menu.new({ items });
  await menu.popup();
}

export async function showCreateWorkspaceMenu(
  onCreateWorkspace: (mode: WorkspaceCreateMode) => void,
): Promise<void> {
  if (!isTauri()) {
    onCreateWorkspace("local");
    return;
  }

  const localItem = await MenuItem.new({
    id: "create-workspace-local",
    text: "Local",
    action: () => onCreateWorkspace("local"),
  });
  const dockerItem = await MenuItem.new({
    id: "create-workspace-docker",
    text: "Docker",
    action: () => onCreateWorkspace("docker"),
  });
  const menu = await Menu.new({ items: [localItem, dockerItem] });
  await menu.popup();
}
