import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { Button, Spinner } from "@lifecycle/ui";
import { Activity, FolderGit2, GitBranch, GitPullRequest, LayoutGrid, Plus } from "lucide-react";
import { type MouseEvent } from "react";
import { NavLink } from "react-router-dom";
import { isMacPlatform } from "../../../app/app-hotkeys";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "../../../app/shortcuts/shortcut-router";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { NavigationControls } from "../../../components/layout/navigation-controls";
import { invokeTauri } from "../../../lib/tauri-error";
import { getWorkspaceSessionStatusState } from "../../workspaces/components/workspace-session-status";
import { getWorkspaceDisplayName } from "../../workspaces/lib/workspace-display";
import {
  listAvailableOpenInTargets,
  resolveDefaultOpenTarget,
  type OpenInTarget,
} from "../../workspaces/lib/open-in-targets";
import { listWorkspaceOpenInApps, openWorkspaceInApp } from "../../workspaces/open-in-api";

interface ContextMenuEntry {
  destructive?: boolean;
  disabled?: boolean;
  id?: string;
  items?: ContextMenuEntry[];
  kind: "item" | "separator" | "submenu";
  label?: string;
}

interface ProjectNavBarProps {
  activeWorkspaceId: string | null;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  onCreateWorkspace: () => void;
  onDestroyWorkspace: (workspace: WorkspaceRecord) => void;
  onForkWorkspace: (workspace: WorkspaceRecord) => void;
  onToggleSidebar?: () => void;
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

const viewNavClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex items-center justify-center px-2 text-[var(--muted-foreground)] transition-colors rounded-md mx-0.5 my-1.5 h-7",
    isActive
      ? "bg-[var(--surface-selected)] text-[var(--foreground)]"
      : "hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
  ].join(" ");

const workspaceNavClass = ({ isActive }: { isActive: boolean }) =>
  [
    "flex items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors rounded-md mx-0.5 my-1.5 h-7",
    isActive
      ? "bg-[var(--surface-selected)] text-[var(--foreground)]"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
  ].join(" ");

async function showWorkspaceContextMenu(
  workspace: WorkspaceRecord,
  callbacks: {
    onDestroy: (workspace: WorkspaceRecord) => void;
    onFork: (workspace: WorkspaceRecord) => void;
  },
): Promise<void> {
  const baseTargets = listAvailableOpenInTargets(isMacPlatform());
  let targets: readonly OpenInTarget[] = baseTargets;

  try {
    const installedApps = await listWorkspaceOpenInApps();
    if (installedApps.length > 0) {
      targets = baseTargets
        .filter((t) => installedApps.some((a) => a.id === t.id))
        .map((t) => {
          const installed = installedApps.find((a) => a.id === t.id);
          return installed ? { ...t, label: installed.label } : t;
        });
    }
  } catch {
    /* use base targets */
  }

  const defaultTarget = resolveDefaultOpenTarget(targets);
  const otherTargets = targets.filter((t) => t.id !== defaultTarget.id);

  const items: ContextMenuEntry[] = [
    { kind: "item", id: `open:${defaultTarget.id}`, label: `Open in ${defaultTarget.label}` },
  ];

  if (otherTargets.length > 0) {
    items.push({
      kind: "submenu",
      label: "Open in...",
      items: otherTargets.map((target) => ({
        kind: "item" as const,
        id: `open:${target.id}`,
        label: target.label,
      })),
    });
  }

  items.push({ kind: "separator" });
  items.push({ kind: "item", id: "fork", label: "Fork Workspace" });
  items.push({ kind: "separator" });
  items.push({ kind: "item", id: "destroy", label: "Destroy Workspace", destructive: true });

  const selectedId = await invokeTauri<string | null>("show_context_menu", { items });

  if (!selectedId) return;

  if (selectedId.startsWith("open:")) {
    const appId = selectedId.slice(5);
    void openWorkspaceInApp(workspace.id, appId as Parameters<typeof openWorkspaceInApp>[1]);
  } else if (selectedId === "fork") {
    callbacks.onFork(workspace);
  } else if (selectedId === "destroy") {
    callbacks.onDestroy(workspace);
  }
}

export function ProjectNavBar({
  activeWorkspaceId: _activeWorkspaceId,
  hasWorkspaceResponseReady,
  hasWorkspaceRunningTurn,
  onCreateWorkspace,
  onDestroyWorkspace,
  onForkWorkspace,
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
      className="flex h-10 shrink-0 items-stretch gap-0 bg-[var(--background)] px-0"
      data-slot="project-nav-bar"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    >
      {/* Navigation controls */}
      {onToggleSidebar ? (
        <div className="flex shrink-0 items-center border-r border-[var(--border)]">
          <NavigationControls onToggleSidebar={onToggleSidebar} sidebarCollapsed={sidebarCollapsed ?? false} />
        </div>
      ) : null}

      {/* View icons */}
      <div className="flex shrink-0 items-stretch pl-1" data-no-drag>
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
      <div aria-hidden="true" className="mx-1 w-px shrink-0 bg-[var(--border)]" />

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
                onContextMenu={(event) => {
                  if (!isTauri()) return;
                  event.preventDefault();
                  void showWorkspaceContextMenu(workspace, {
                    onDestroy: onDestroyWorkspace,
                    onFork: onForkWorkspace,
                  });
                }}
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

    </header>
  );
}
