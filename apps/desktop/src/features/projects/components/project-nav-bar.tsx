import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { Button, Spinner } from "@lifecycle/ui";
import { Activity, GitPullRequest, LayoutGrid, Plus, TerminalSquare } from "lucide-react";
import { type MouseEvent, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "../../../app/shortcuts/shortcut-router";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { NavigationControls } from "../../../components/layout/navigation-controls";
import { getWorkspaceSessionStatusState } from "../../workspaces/components/workspace-session-status";
import { getWorkspaceDisplayName } from "../../workspaces/lib/workspace-display";

interface ProjectNavBarProps {
  actionsOutlet?: ReactNode;
  activeWorkspaceId: string | null;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  onCreateWorkspace: () => void;
  onToggleSidebar?: () => void;
  projectId: string;
  sidebarCollapsed?: boolean;
  workspaces: WorkspaceRecord[];
}

function WorkspaceNavIcon({
  responseReady,
  running,
}: {
  responseReady: boolean;
  running: boolean;
}) {
  const state = getWorkspaceSessionStatusState({ responseReady, running });

  if (state === "ready") {
    return <ResponseReadyDot />;
  }

  if (state === "loading") {
    return (
      <span
        aria-label="Generating response"
        className="flex items-center justify-center"
        role="img"
        title="Generating response"
      >
        <Spinner
          aria-hidden="true"
          aria-label={undefined}
          className="size-3.5 text-[var(--muted-foreground)]"
          role={undefined}
        />
      </span>
    );
  }

  return <TerminalSquare className="size-3.5" strokeWidth={2} />;
}

const viewNavClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex h-full items-center justify-center px-2.5 text-[var(--muted-foreground)] transition-colors",
    isActive
      ? "text-[var(--foreground)] border-b border-[var(--foreground)]"
      : "hover:text-[var(--foreground)]",
  ].join(" ");

const workspaceNavClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex h-full items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
    isActive
      ? "text-[var(--foreground)] border-b border-[var(--foreground)]"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
  ].join(" ");

export function ProjectNavBar({
  actionsOutlet,
  activeWorkspaceId,
  hasWorkspaceResponseReady,
  hasWorkspaceRunningTurn,
  onCreateWorkspace,
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
      className="flex h-10 shrink-0 items-stretch gap-0 border-b border-[var(--border)] bg-[var(--surface)] px-0"
      data-slot="project-nav-bar"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    >
      {/* Navigation controls — only rendered here when sidebar is collapsed */}
      {sidebarCollapsed && onToggleSidebar ? (
        <div className="flex shrink-0 items-center border-r border-[var(--border)]">
          <NavigationControls onToggleSidebar={onToggleSidebar} sidebarCollapsed={true} />
        </div>
      ) : null}

      {/* View icons */}
      <div className="flex shrink-0 items-stretch" data-no-drag>
        <NavLink className={viewNavClass} end title="Overview" to={basePath}>
          <LayoutGrid className="size-3.5" strokeWidth={2} />
        </NavLink>
        <NavLink className={viewNavClass} title="Pull Requests" to={`${basePath}/pulls`}>
          <GitPullRequest className="size-3.5" strokeWidth={2} />
        </NavLink>
        <NavLink className={viewNavClass} title="Activity" to={`${basePath}/activity`}>
          <Activity className="size-3.5" strokeWidth={2} />
        </NavLink>
      </div>

      {/* Divider */}
      <div aria-hidden="true" className="my-2 w-px shrink-0 bg-[var(--border)]" />

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
                <WorkspaceNavIcon responseReady={responseReady} running={running} />
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

      {/* Actions */}
      {actionsOutlet ? (
        <>
          <div aria-hidden="true" className="my-2 w-px shrink-0 bg-[var(--border)]" />
          <div className="flex shrink-0 items-center px-2" data-no-drag>
            {actionsOutlet}
          </div>
        </>
      ) : null}
    </header>
  );
}
