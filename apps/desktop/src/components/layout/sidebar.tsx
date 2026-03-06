import type { ProjectRecord } from "@lifecycle/contracts";
import type { ManifestStatus } from "../../features/projects/api/projects";
import { ProjectItem } from "../../features/projects/components/project-item";
import type { WorkspaceRow } from "../../features/workspaces/api";
import { WorkspaceTreeItem } from "../../features/workspaces/components/workspace-tree-item";

interface SidebarProps {
  isLoading?: boolean;
  projects: ProjectRecord[];
  manifestStates: Record<string, ManifestStatus["state"]>;
  workspacesByProjectId: Record<string, WorkspaceRow[]>;
  selectedProjectId: string | null;
  selectedWorkspaceId: string | null;
  onSelectProject: (projectId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onAddProject: () => void;
  onCreateWorkspace: (projectId: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  isLoading = false,
  projects,
  manifestStates,
  workspacesByProjectId,
  selectedProjectId,
  selectedWorkspaceId,
  onSelectProject,
  onSelectWorkspace,
  onAddProject,
  onCreateWorkspace,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h1 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">Projects</h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {isLoading && projects.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-[var(--muted-foreground)]">
            Loading projects...
          </p>
        ) : projects.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-[var(--muted-foreground)]">
            No projects yet
          </p>
        ) : (
          <ul className="space-y-1">
            {projects.map((project) => {
              const workspaces = workspacesByProjectId[project.id] ?? [];
              return (
                <li key={project.id}>
                  <ProjectItem
                    project={project}
                    manifestState={manifestStates[project.id] ?? "missing"}
                    selected={project.id === selectedProjectId}
                    onSelect={() => onSelectProject(project.id)}
                    onCreateWorkspace={() => onCreateWorkspace(project.id)}
                  />

                  {workspaces.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-3">
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
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={onAddProject}
          className="flex w-full items-center justify-center rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:brightness-110"
        >
          Add project
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-2 flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          Settings
        </button>
      </div>
    </aside>
  );
}
