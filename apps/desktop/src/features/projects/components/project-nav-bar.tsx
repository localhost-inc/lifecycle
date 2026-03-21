import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { Button, IconButton, Spinner } from "@lifecycle/ui";
import {
  FolderGit2,
  GitBranch,
  Megaphone,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, type MouseEvent, type ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";
import type { WorkspaceCreateMode } from "@/features/workspaces/api";
import { ResponseReadyDot } from "@/components/response-ready-dot";
import { NavigationControls } from "@/components/layout/navigation-controls";
import { getWorkspaceSessionStatusState } from "@/features/workspaces/components/workspace-session-status";
import { getWorkspaceDisplayName, isRootWorkspace } from "@/features/workspaces/lib/workspace-display";
import {
  listAvailableOpenInTargets,
  resolveDefaultOpenTarget,
} from "@/features/workspaces/lib/open-in-targets";
import { openWorkspaceInApp } from "@/features/workspaces/open-in-api";
import { isMacPlatform } from "@/app/app-hotkeys";
import { openUrl } from "@tauri-apps/plugin-opener";
import { bugs } from "../../../../package.json";

interface ProjectNavBarProps {
  actionsOutlet?: ReactNode;
  activeWorkspaceId: string | null;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  onCreateWorkspace: (mode: WorkspaceCreateMode) => void;
  onDestroyWorkspace: (workspace: WorkspaceRecord) => void;
  onForkWorkspace: (workspace: WorkspaceRecord) => void;
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
  projectId: string;
  sidebarCollapsed?: boolean;
  workspaces: WorkspaceRecord[];
}

function WorkspaceNavIcon({
  checkoutType,
  responseReady,
  running,
}: {
  checkoutType: WorkspaceRecord["checkout_type"];
  responseReady: boolean;
  running: boolean;
}) {
  const state = getWorkspaceSessionStatusState({ responseReady, running });

  if (state === "ready") {
    return <ResponseReadyDot />;
  }

  if (state === "loading") {
    return <Spinner className="size-4 text-[var(--muted-foreground)]" />;
  }

  const Icon = checkoutType === "root" ? FolderGit2 : GitBranch;
  return <Icon className="size-4" strokeWidth={2} />;
}

const workspaceNavClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex items-center gap-1.5 px-3 text-[13px] font-medium whitespace-nowrap transition-colors rounded-lg h-7",
    isActive
      ? "bg-[var(--card)] text-[var(--foreground)] shadow-[0_0_0_0.5px_var(--border)]"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
  ].join(" ");

export function ProjectNavBar({
  actionsOutlet,
  activeWorkspaceId,
  hasWorkspaceResponseReady,
  hasWorkspaceRunningTurn,
  onCreateWorkspace,
  onDestroyWorkspace,
  onForkWorkspace,
  onOpenSettings,
  onToggleSidebar,
  projectId,
  sidebarCollapsed,
  workspaces,
}: ProjectNavBarProps) {
  // Keep shortcuts registered so they work regardless of where the buttons live
  useShortcutRegistration({
    handler: () => {
      window.history.back();
    },
    id: "project.go-back",
    priority: SHORTCUT_HANDLER_PRIORITY.project,
  });

  useShortcutRegistration({
    handler: () => {
      window.history.forward();
    },
    id: "project.go-forward",
    priority: SHORTCUT_HANDLER_PRIORITY.project,
  });

  const navTo = useNavigate();

  useShortcutRegistration({
    handler: useCallback(() => {
      if (!activeWorkspaceId || workspaces.length <= 1) {
        return true;
      }
      const currentIndex = workspaces.findIndex((ws) => ws.id === activeWorkspaceId);
      const prevIndex = (currentIndex - 1 + workspaces.length) % workspaces.length;
      const target = workspaces[prevIndex];
      if (target) {
        void navTo(`/projects/${projectId}/workspaces/${target.id}`);
      }
      return true;
    }, [activeWorkspaceId, navTo, projectId, workspaces]),
    id: "workspace.previous-workspace",
    priority: SHORTCUT_HANDLER_PRIORITY.project,
  });

  useShortcutRegistration({
    handler: useCallback(() => {
      if (!activeWorkspaceId || workspaces.length <= 1) {
        return true;
      }
      const currentIndex = workspaces.findIndex((ws) => ws.id === activeWorkspaceId);
      const nextIndex = (currentIndex + 1) % workspaces.length;
      const target = workspaces[nextIndex];
      if (target) {
        void navTo(`/projects/${projectId}/workspaces/${target.id}`);
      }
      return true;
    }, [activeWorkspaceId, navTo, projectId, workspaces]),
    id: "workspace.next-workspace",
    priority: SHORTCUT_HANDLER_PRIORITY.project,
  });

  const [extensionPanelCollapsed, setExtensionPanelCollapsed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      setExtensionPanelCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };

    window.addEventListener("lifecycle:extension-panel-state", handler);
    return () => window.removeEventListener("lifecycle:extension-panel-state", handler);
  }, []);

  const handleWorkspaceContextMenu = useCallback(
    async (event: MouseEvent<HTMLElement>, workspace: WorkspaceRecord) => {
      event.preventDefault();

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
        action: () => onForkWorkspace(workspace),
      });

      const items: (MenuItem | PredefinedMenuItem)[] = [openInEditorItem, forkItem];

      if (!isRootWorkspace(workspace)) {
        const separator = await PredefinedMenuItem.new({ item: "Separator" });
        const destroyItem = await MenuItem.new({
          id: "destroy-workspace",
          text: "Destroy Workspace",
          action: () => onDestroyWorkspace(workspace),
        });
        items.push(separator, destroyItem);
      }

      const menu = await Menu.new({ items });

      await menu.popup();
    },
    [onDestroyWorkspace, onForkWorkspace],
  );

  const handleCreateWorkspaceMenu = useCallback(
    async (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();

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
    },
    [onCreateWorkspace],
  );

  const handleMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !isTauri()) {
      return;
    }

    if (
      (event.target as Element).closest(
        "a, button, input, textarea, select, [role='button'], [data-no-drag]",
      )
    ) {
      return;
    }

    event.preventDefault();

    if (event.detail >= 2) {
      void getCurrentWindow().toggleMaximize();
    } else {
      void getCurrentWindow()
        .startDragging()
        .catch(() => {});
    }
  };

  const basePath = `/projects/${projectId}`;

  return (
    <header
      className="flex h-10 shrink-0 items-stretch gap-0 bg-[var(--background)] px-0"
      data-slot="project-nav-bar"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    >
      {/* Navigation controls */}
      <div className="flex shrink-0 items-center">
        <NavigationControls
          onToggleSidebar={onToggleSidebar}
          sidebarCollapsed={sidebarCollapsed ?? false}
        />
      </div>

      {/* Workspace links */}
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden py-px [&::-webkit-scrollbar]:hidden">
        <div className="flex h-full min-w-max items-center gap-0.5">
          {workspaces.map((workspace) => {
            const displayName = getWorkspaceDisplayName(workspace);
            const responseReady = hasWorkspaceResponseReady(workspace.id);
            const running = hasWorkspaceRunningTurn(workspace.id);

            return (
              <NavLink
                key={workspace.id}
                className={workspaceNavClass}
                onContextMenu={(event) => void handleWorkspaceContextMenu(event, workspace)}
                title={displayName}
                to={`${basePath}/workspaces/${workspace.id}`}
              >
                <WorkspaceNavIcon
                  checkoutType={workspace.checkout_type}
                  responseReady={responseReady}
                  running={running}
                />
                <span className="max-w-[180px] truncate">{displayName}</span>
              </NavLink>
            );
          })}
          <div className="flex items-center px-1">
            <Button
              aria-label="Create workspace"
              onClick={(event) => void handleCreateWorkspaceMenu(event)}
              size="icon"
              variant="ghost"
            >
              <Plus size={16} strokeWidth={2} />
            </Button>
          </div>
        </div>
      </div>

      {/* Actions outlet (run, git) + trailing icons */}
      {actionsOutlet}
      <div className="flex shrink-0 items-center gap-1 pl-1 pr-2">
        <IconButton aria-label="Feedback" onClick={() => void openUrl(bugs.url)} title="Feedback">
          <Megaphone size={14} strokeWidth={2} />
        </IconButton>
        <IconButton aria-label="Settings" onClick={onOpenSettings} title="Settings">
          <Settings size={14} strokeWidth={2} />
        </IconButton>
        <IconButton
          aria-label="Toggle extension panel"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("lifecycle:toggle-extension-panel"));
          }}
          title="Toggle extension panel"
        >
          {extensionPanelCollapsed ? (
            <PanelRightOpen size={16} strokeWidth={2} />
          ) : (
            <PanelRightClose size={16} strokeWidth={2} />
          )}
        </IconButton>
      </div>
    </header>
  );
}
