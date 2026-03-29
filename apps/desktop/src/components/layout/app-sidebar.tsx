import { isTauri } from "@tauri-apps/api/core";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AuthSession } from "@lifecycle/auth";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { useWorkspaceClientRegistry } from "@lifecycle/workspace/react";
import { IconButton, Logo, Spinner } from "@lifecycle/ui";
import { Archive, FolderGit2, GitBranch, Megaphone, Plus, Settings } from "lucide-react";
import { NavigationControls } from "@/components/layout/navigation-controls";
import { type MouseEvent, useCallback, useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { isMacPlatform } from "@/app/app-hotkeys";
import { resolveProjectRepoWorkspace } from "@/features/projects/lib/project-repo-workspace";
import {
  readProjectPaths,
  resolveProjectNavigationTarget,
} from "@/features/projects/state/project-content-tabs";
import { UserAvatar } from "@/features/user/components/user-avatar";
import { ResponseReadyDot } from "@/components/response-ready-dot";
import { openUrl } from "@tauri-apps/plugin-opener";
import { bugs } from "../../../package.json";
import type { WorkspaceCreateMode } from "@/features/workspaces/types";
import {
  getWorkspaceDisplayName,
  isRootWorkspace,
} from "@/features/workspaces/lib/workspace-display";
import {
  listAvailableOpenInTargets,
  resolveDefaultOpenTarget,
} from "@/features/workspaces/lib/open-in-targets";
import { getWorkspaceSessionStatusState } from "@/features/workspaces/surfaces/workspace-session-status";
import {
  showCreateWorkspaceMenu,
  showWorkspaceContextMenu,
} from "@/features/workspaces/lib/workspace-menus";

interface AppSidebarProps {
  activeContextName: string;
  authSession: AuthSession;
  authSessionLoading: boolean;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  onAddProject: () => void;
  onCreateWorkspace: (projectId: string, mode: WorkspaceCreateMode) => Promise<void>;
  onArchiveWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onOpenSettings: () => void;
  onRemoveProject: (projectId: string) => void;
  projects: ProjectRecord[];
  readyProjectIds: ReadonlySet<string>;
  workspacesByProjectId: Record<string, WorkspaceRecord[]>;
  width: number;
}

function WorkspaceIcon({
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
    return <Spinner className="size-3.5 text-[var(--sidebar-muted-foreground)]" />;
  }

  const Icon = checkoutType === "root" ? FolderGit2 : GitBranch;
  return <Icon className="size-3.5 shrink-0" strokeWidth={2} />;
}

export function AppSidebar({
  activeContextName,
  authSession,
  authSessionLoading,
  hasWorkspaceResponseReady,
  hasWorkspaceRunningTurn,
  onAddProject,
  onCreateWorkspace,
  onArchiveWorkspace,
  onOpenSettings,
  onRemoveProject,
  projects,
  readyProjectIds,
  workspacesByProjectId,
  width,
}: AppSidebarProps) {
  const { projectId, workspaceId } = useParams();
  const location = useLocation();
  const workspaceClientRegistry = useWorkspaceClientRegistry();
  const projectPaths = useMemo(() => {
    const storedPaths = readProjectPaths();
    const paths: Record<string, string> = {};

    for (const project of projects) {
      const repositoryWorkspaceId =
        resolveProjectRepoWorkspace(workspacesByProjectId[project.id] ?? [])?.id ?? null;
      paths[project.id] = resolveProjectNavigationTarget({
        currentPathname: location.pathname,
        projectId: project.id,
        repositoryWorkspaceId,
        storedSubPath: storedPaths[project.id],
      });
    }

    return paths;
  }, [location.pathname, projects, workspacesByProjectId]);

  const handleMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !isTauri()) {
      return;
    }

    if ((event.target as Element).closest("a, button, input, textarea, select, [role='button']")) {
      return;
    }

    event.preventDefault();

    if (event.detail >= 2) {
      void getCurrentWindow().toggleMaximize();
    } else {
      void getCurrentWindow().startDragging();
    }
  }, []);

  const handleProjectContextMenu = useCallback(
    async (event: MouseEvent<HTMLElement>, project: ProjectRecord) => {
      event.preventDefault();

      const removeItem = await MenuItem.new({
        id: "remove-project",
        text: "Remove Project",
        action: () => onRemoveProject(project.id),
      });

      const menu = await Menu.new({ items: [removeItem] });
      await menu.popup();
    },
    [onRemoveProject],
  );

  const handleWorkspaceContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>, workspace: WorkspaceRecord) => {
      event.preventDefault();
      void showWorkspaceContextMenu(workspace, {
        onArchiveWorkspace: onArchiveWorkspace,
        onOpenWorkspaceInApp: (targetWorkspace) => {
          const workspaceClient = workspaceClientRegistry.resolve(targetWorkspace.host);
          const target = resolveDefaultOpenTarget(listAvailableOpenInTargets(isMacPlatform()));
          void workspaceClient.openInApp(targetWorkspace, target.id);
        },
      });
    },
    [onArchiveWorkspace, workspaceClientRegistry],
  );

  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col bg-[var(--background)] text-[var(--sidebar-foreground)]"
      data-slot="app-sidebar"
      onMouseDown={handleMouseDown}
      style={{ width: `${width / 16}rem` }}
    >
      {/* Traffic light spacer + navigation */}
      <div className="flex h-10 shrink-0 items-center justify-end">
        <NavigationControls />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Organization / context switcher */}
        <button
          aria-label={`Open ${activeContextName} context`}
          className="flex w-full shrink-0 items-center gap-2 px-4 py-2 text-left"
          data-slot="app-sidebar-context"
          onClick={onOpenSettings}
          type="button"
        >
          <UserAvatar loading={authSessionLoading} session={authSession} size={28} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--sidebar-foreground)]">
            {activeContextName}
          </span>
        </button>

        {/* Project + workspace list */}
        <div className="flex min-h-0 flex-1 flex-col pt-2">
          <div className="flex items-center justify-between pl-4 pr-2 pb-1">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">Projects</p>
            <IconButton aria-label="Add project" onClick={onAddProject}>
              <Plus className="size-3.5" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            <div className="flex flex-col">
              {projects.map((project) => {
                const selected = project.id === projectId;
                const responseReady = readyProjectIds.has(project.id);
                const workspaces = workspacesByProjectId[project.id] ?? [];

                return (
                  <div key={project.id} className="flex flex-col">
                    {/* Project row */}
                    <div className="group/project flex items-center gap-1 pr-1">
                      <Link
                        aria-label={`Open project ${project.name}`}
                        className={[
                          "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium transition-colors",
                          selected
                            ? "text-[var(--sidebar-foreground)]"
                            : "text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)]",
                        ].join(" ")}
                        onContextMenu={(e) => handleProjectContextMenu(e, project)}
                        to={projectPaths[project.id] ?? `/projects/${project.id}`}
                        title={project.name}
                      >
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        {responseReady ? (
                          <ResponseReadyDot className="shrink-0 scale-[0.85]" />
                        ) : null}
                      </Link>
                      {selected ? (
                        <button
                          aria-label="New workspace"
                          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-[var(--sidebar-muted-foreground)] opacity-0 transition-all hover:bg-[var(--surface-hover)] hover:text-[var(--sidebar-foreground)] group-hover/project:opacity-100"
                          onClick={(e) => {
                            e.preventDefault();
                            void showCreateWorkspaceMenu(
                              (mode) => void onCreateWorkspace(project.id, mode),
                            );
                          }}
                          type="button"
                        >
                          <Plus className="size-3.5" strokeWidth={2} />
                        </button>
                      ) : null}
                    </div>

                    {/* Workspaces — shown under the selected project */}
                    {selected && workspaces.length > 0 ? (
                      <div className="flex flex-col gap-0.5 pb-1">
                        {workspaces.map((workspace) => {
                          const active = workspace.id === workspaceId;
                          const wsResponseReady = hasWorkspaceResponseReady(workspace.id);
                          const wsRunning = hasWorkspaceRunningTurn(workspace.id);

                          return (
                            <Link
                              key={workspace.id}
                              className={[
                                "group/workspace flex items-center gap-1.5 rounded-xl py-1.5 pl-4 pr-1 text-xs font-semibold transition-colors",
                                active
                                  ? "bg-[var(--glass)] text-[var(--foreground)]"
                                  : "text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)]",
                              ].join(" ")}
                              onContextMenu={(e) => handleWorkspaceContextMenu(e, workspace)}
                              title={getWorkspaceDisplayName(workspace)}
                              to={`/projects/${project.id}/workspaces/${workspace.id}`}
                            >
                              <WorkspaceIcon
                                checkoutType={workspace.checkout_type}
                                responseReady={wsResponseReady}
                                running={wsRunning}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {getWorkspaceDisplayName(workspace)}
                              </span>
                              {!isRootWorkspace(workspace) ? (
                                <button
                                  aria-label={`Archive ${getWorkspaceDisplayName(workspace)}`}
                                  className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-[var(--sidebar-muted-foreground)] opacity-0 transition-all hover:bg-[var(--surface-hover)] hover:text-[var(--sidebar-foreground)] group-hover/workspace:opacity-100"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void onArchiveWorkspace(workspace);
                                  }}
                                  type="button"
                                >
                                  <Archive className="size-3" strokeWidth={2} />
                                </button>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom actions + wordmark */}
        <div className="flex shrink-0 items-center gap-1 px-4 pb-3 pt-1">
          <Logo
            className="cursor-pointer text-[var(--sidebar-muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            onClick={() => openUrl("https://lifecycle.dev")}
            size={20}
          />
          <div className="ml-auto flex items-center gap-0.5">
            <IconButton
              aria-label="Feedback"
              onClick={() => void openUrl(bugs.url)}
              title="Feedback"
            >
              <Megaphone size={14} strokeWidth={2} />
            </IconButton>
            <IconButton aria-label="Settings" onClick={onOpenSettings} title="Settings">
              <Settings size={14} strokeWidth={2} />
            </IconButton>
          </div>
        </div>
      </div>
    </aside>
  );
}
