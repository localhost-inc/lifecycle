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
    onDestroyWorkspace: (workspace: WorkspaceRecord) => void;
    onForkWorkspace: (workspace: WorkspaceRecord) => void;
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

  const forkItem = await MenuItem.new({
    id: "fork-workspace",
    text: "Fork Workspace",
    action: () => callbacks.onForkWorkspace(workspace),
  });

  const items: (MenuItem | PredefinedMenuItem)[] = [openInEditorItem, forkItem];

  if (!isRootWorkspace(workspace)) {
    const separator = await PredefinedMenuItem.new({ item: "Separator" });
    const destroyItem = await MenuItem.new({
      id: "destroy-workspace",
      text: "Destroy Workspace",
      action: () => callbacks.onDestroyWorkspace(workspace),
    });
    items.push(separator, destroyItem);
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
