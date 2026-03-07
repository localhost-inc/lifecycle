import { isTauri } from "@tauri-apps/api/core";
import type { ProjectRecord } from "@lifecycle/contracts";
import { Collapsible, CollapsibleContent } from "@lifecycle/ui";
import { FolderPlus, Settings } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useHistoryAvailability } from "../../app/history-stack";
import { ProjectItem } from "../../features/projects/components/project-item";
import type { WorkspaceRow } from "../../features/workspaces/api";
import { WorkspaceTreeItem } from "../../features/workspaces/components/workspace-tree-item";

interface SidebarProps {
  isLoading?: boolean;
  projects: ProjectRecord[];
  workspacesByProjectId: Record<string, WorkspaceRow[]>;
  selectedProjectId: string | null;
  selectedWorkspaceId: string | null;
  width: number;
  onSelectProject: (projectId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onAddProject: () => void;
  onCreateWorkspace: (projectId: string) => void;
  onOpenSettings: () => void;
}

function detectPlatformHint(): string {
  if (typeof navigator === "undefined") {
    return "";
  }

  const userAgentDataPlatform =
    "userAgentData" in navigator &&
    typeof navigator.userAgentData === "object" &&
    navigator.userAgentData !== null &&
    "platform" in navigator.userAgentData
      ? String(navigator.userAgentData.platform)
      : undefined;

  return (userAgentDataPlatform ?? navigator.platform ?? navigator.userAgent).trim().toLowerCase();
}

export function shouldInsetSidebarHeaderForWindowControls(
  platformHint: string | null | undefined,
  tauriEnvironment: boolean,
): boolean {
  if (!tauriEnvironment) {
    return false;
  }

  return platformHint?.trim().toLowerCase().includes("mac") ?? false;
}

export function getSidebarHeaderClassName(shouldInsetForWindowControls: boolean): string {
  if (shouldInsetForWindowControls) {
    return "flex flex-col gap-3 px-4 pb-3 pt-4";
  }

  return "flex items-center justify-between px-4 py-3";
}

export function Sidebar({
  isLoading = false,
  projects,
  workspacesByProjectId,
  selectedProjectId,
  selectedWorkspaceId,
  width,
  onSelectProject,
  onSelectWorkspace,
  onAddProject,
  onCreateWorkspace,
  onOpenSettings,
}: SidebarProps) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryAvailability();
  const shouldInsetSidebarHeader = shouldInsetSidebarHeaderForWindowControls(
    detectPlatformHint(),
    isTauri(),
  );
  const goBack = useCallback(() => {
    if (!canGoBack) return;
    navigate(-1);
  }, [canGoBack, navigate]);
  const goForward = useCallback(() => {
    if (!canGoForward) return;
    navigate(1);
  }, [canGoForward, navigate]);
  const historyActions = (
    <>
      <button
        type="button"
        aria-label="Go back"
        onClick={goBack}
        disabled={!canGoBack}
        className="flex h-6 w-6 items-center justify-center rounded text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        ←
      </button>
      <button
        type="button"
        aria-label="Go forward"
        onClick={goForward}
        disabled={!canGoForward}
        className="flex h-6 w-6 items-center justify-center rounded text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        →
      </button>
    </>
  );
  const addProjectAction = (
    <button
      type="button"
      onClick={onAddProject}
      className="flex h-6 w-6 items-center justify-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      title="Add project"
    >
      <FolderPlus size={16} />
    </button>
  );

  return (
    <aside
      className="flex h-full shrink-0 flex-col bg-[var(--panel)]"
      style={{ width: `${width}px` }}
    >
      <div data-tauri-drag-region className={getSidebarHeaderClassName(shouldInsetSidebarHeader)}>
        {shouldInsetSidebarHeader ? (
          <>
            <div data-no-drag className="flex min-h-6 items-center justify-end gap-1">
              {historyActions}
            </div>
            <div className="flex items-center justify-between">
              <h1 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
                Workspaces
              </h1>
              <div data-no-drag>{addProjectAction}</div>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
              Workspaces
            </h1>
            <div data-no-drag className="flex items-center gap-1">
              {historyActions}
              {addProjectAction}
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {isLoading && projects.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-[var(--muted-foreground)]">
            Loading projects...
          </p>
        ) : projects.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-[var(--muted-foreground)]">
            No projects yet
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => {
              const workspaces = workspacesByProjectId[project.id] ?? [];
              return (
                <li key={project.id}>
                  <Collapsible defaultOpen className="group/project">
                    <ProjectItem
                      project={project}
                      selected={project.id === selectedProjectId}
                      onSelect={() => onSelectProject(project.id)}
                      onCreateWorkspace={() => onCreateWorkspace(project.id)}
                    />

                    {workspaces.length > 0 && (
                      <CollapsibleContent>
                        <ul className="mt-0.5 space-y-0.5">
                          {workspaces.map((workspace) => (
                            <li key={workspace.id}>
                              <WorkspaceTreeItem
                                workspace={workspace}
                                selected={workspace.id === selectedWorkspaceId}
                                onSelect={() => onSelectWorkspace(workspace.id)}
                              />
                            </li>
                          ))}
                        </ul>
                      </CollapsibleContent>
                    )}
                  </Collapsible>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          <Settings size={14} />
          Settings
        </button>
      </div>
    </aside>
  );
}
