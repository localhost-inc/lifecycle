import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { Button, Spinner } from "@lifecycle/ui";
import { ExternalLink, FolderGit2, GitBranch, GitFork, Megaphone, Plus, Settings, Trash2 } from "lucide-react";
import { useCallback, type MouseEvent, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "../../../app/shortcuts/shortcut-router";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { NavigationControls } from "../../../components/layout/navigation-controls";
import { getWorkspaceSessionStatusState } from "../../workspaces/components/workspace-session-status";
import { openUrl } from "@tauri-apps/plugin-opener";
import { bugs } from "../../../../package.json";
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
  onOpenSettings: () => void;
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
      <Spinner
        aria-hidden="true"
        aria-label={undefined}
        className="size-3.5 text-[var(--muted-foreground)]"
        role={undefined}
      />
    );
  }

  const Icon = kind === "root" ? FolderGit2 : GitBranch;
  return <Icon className="size-3.5" strokeWidth={2} />;
}

const workspaceNavClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors rounded-md mx-0.5 my-1.5 h-7",
    isActive
      ? "bg-[var(--surface-selected)] text-[var(--foreground)]"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
  ].join(" ");

export function ProjectNavBar({
  activeWorkspaceId,
  hasWorkspaceResponseReady,
  hasWorkspaceRunningTurn,
  onCreateWorkspace,
  onDestroyWorkspace,
  onForkWorkspace,
  onOpenSettings,
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
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
        data-no-drag
      >
        <div className="flex h-full min-w-max items-stretch">
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
              <Plus size={14} strokeWidth={2} />
            </Button>
          </div>
        </div>
      </div>

      {/* Workspace actions */}
      {activeWorkspace ? (
        <>
          <div className="flex shrink-0 items-center gap-0.5 pl-1" data-no-drag>
            <button
              aria-label="Open in editor"
              className="flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              onClick={() => {
                const target = resolveDefaultOpenTarget(listAvailableOpenInTargets(isMacPlatform()));
                void openWorkspaceInApp(activeWorkspace.id, target.id);
              }}
              title="Open in editor"
              type="button"
            >
              <ExternalLink size={14} strokeWidth={2} />
            </button>
            <button
              aria-label="Fork workspace"
              className="flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              onClick={() => onForkWorkspace(activeWorkspace)}
              title="Fork workspace"
              type="button"
            >
              <GitFork size={14} strokeWidth={2} />
            </button>
            <button
              aria-label="Destroy workspace"
              className="flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              onClick={() => onDestroyWorkspace(activeWorkspace)}
              title="Destroy workspace"
              type="button"
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          </div>
          <div aria-hidden="true" className="mx-1 w-px shrink-0 bg-[var(--border)]" />
        </>
      ) : null}

      {/* Settings & feedback */}
      <div className="flex shrink-0 items-center gap-0.5 pr-2" data-no-drag>
        <button
          aria-label="Feedback"
          className="flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
          onClick={() => openUrl(bugs.url)}
          title="Feedback"
          type="button"
        >
          <Megaphone size={14} strokeWidth={2} />
        </button>
        <button
          aria-label="Settings"
          className="flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
          onClick={onOpenSettings}
          title="Settings"
          type="button"
        >
          <Settings size={14} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
