import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { Button, IconButton, Spinner } from "@lifecycle/ui";
import { ExternalLink, FolderGit2, GitBranch, GitFork, PanelRight, Plus, Trash2 } from "lucide-react";
import { useCallback, type MouseEvent, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "../../../app/shortcuts/shortcut-router";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { NavigationControls } from "../../../components/layout/navigation-controls";
import { getWorkspaceSessionStatusState } from "../../workspaces/components/workspace-session-status";
import { getWorkspaceDisplayName } from "../../workspaces/lib/workspace-display";
import { listAvailableOpenInTargets, resolveDefaultOpenTarget } from "../../workspaces/lib/open-in-targets";
import { openWorkspaceInApp } from "../../workspaces/open-in-api";
import { isMacPlatform } from "../../../app/app-hotkeys";

interface ProjectNavBarProps {
  activeWorkspaceId: string | null;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  onCreateWorkspace: () => void;
  onDestroyWorkspace: (workspace: WorkspaceRecord) => void;
  onForkWorkspace: (workspace: WorkspaceRecord) => void;
  projectId: string;
  sidebarCollapsed?: boolean;
  workspaces: WorkspaceRecord[];
}

function WorkspaceNavIcon({
  kind,
  responseReady,
  running,
}: {
  kind: WorkspaceRecord["kind"];
  responseReady: boolean;
  running: boolean;
}) {
  const state = getWorkspaceSessionStatusState({ responseReady, running });

  if (state === "ready") {
    return <ResponseReadyDot />;
  }

  if (state === "loading") {
    return (
      <Spinner className="size-4 text-[var(--muted-foreground)]" />
    );
  }

  const Icon = kind === "root" ? FolderGit2 : GitBranch;
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
  activeWorkspaceId,
  hasWorkspaceResponseReady,
  hasWorkspaceRunningTurn,
  onCreateWorkspace,
  onDestroyWorkspace,
  onForkWorkspace,
  projectId,
  sidebarCollapsed,
  workspaces,
}: ProjectNavBarProps) {
  const activeWorkspace = useMemo(
    () => (activeWorkspaceId ? (workspaces.find((ws) => ws.id === activeWorkspaceId) ?? null) : null),
    [activeWorkspaceId, workspaces],
  );
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
        <NavigationControls sidebarCollapsed={sidebarCollapsed ?? false} />
      </div>

      {/* Workspace links */}
      <div
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden py-px [&::-webkit-scrollbar]:hidden"
        data-no-drag
      >
        <div className="flex h-full min-w-max items-center gap-0.5">
          {workspaces.map((workspace) => {
            const displayName = getWorkspaceDisplayName(workspace);
            const responseReady = hasWorkspaceResponseReady(workspace.id);
            const running = hasWorkspaceRunningTurn(workspace.id);

            return (
              <NavLink
                key={workspace.id}
                className={workspaceNavClass}
                title={displayName}
                to={`${basePath}/workspaces/${workspace.id}`}
              >
                <WorkspaceNavIcon kind={workspace.kind} responseReady={responseReady} running={running} />
                <span className="max-w-[180px] truncate">{displayName}</span>
              </NavLink>
            );
          })}
          <div className="flex items-center px-1">
            <Button
              aria-label="Create workspace"
              onClick={onCreateWorkspace}
              size="icon"
              variant="ghost"
            >
              <Plus size={16} strokeWidth={2} />
            </Button>
          </div>
        </div>
      </div>

      {/* Workspace actions */}
      {activeWorkspace ? (
        <>
          <div className="flex shrink-0 items-center gap-0.5 pl-1" data-no-drag>
            <IconButton
              aria-label="Open in editor"
              onClick={() => {
                const target = resolveDefaultOpenTarget(listAvailableOpenInTargets(isMacPlatform()));
                void openWorkspaceInApp(activeWorkspace.id, target.id);
              }}
              title="Open in editor"
            >
              <ExternalLink size={16} strokeWidth={2} />
            </IconButton>
            <IconButton
              aria-label="Fork workspace"
              onClick={() => onForkWorkspace(activeWorkspace)}
              title="Fork workspace"
            >
              <GitFork size={16} strokeWidth={2} />
            </IconButton>
            <IconButton
              aria-label="Destroy workspace"
              onClick={() => onDestroyWorkspace(activeWorkspace)}
              title="Destroy workspace"
            >
              <Trash2 size={16} strokeWidth={2} />
            </IconButton>
            <IconButton
              aria-label="Toggle extension panel"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("lifecycle:toggle-extension-panel"));
              }}
              title="Toggle extension panel"
            >
              <PanelRight size={16} strokeWidth={2} />
            </IconButton>
          </div>
          <div aria-hidden="true" className="mx-1 w-px shrink-0 bg-[var(--border)]" />
        </>
      ) : null}
    </header>
  );
}
