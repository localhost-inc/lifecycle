import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { Button, EmptyState } from "@lifecycle/ui";
import {
  Activity,
  GitPullRequest,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@lifecycle/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectViewId } from "../types/project-content-tabs";
import { WorkspaceTreeItem } from "../../workspaces/components/workspace-tree-item";

function projectMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

interface ProjectSidebarProps {
  activeViewId: ProjectViewId | null;
  project: ProjectRecord;
  selectedWorkspaceId: string | null;
  onCreateWorkspace: () => void;
  onDestroyWorkspace: (workspace: WorkspaceRecord) => void;
  onOpenProjectView: (viewId: ProjectViewId) => void;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onRemoveProject: () => void;
  workspaces: WorkspaceRecord[];
}

export function ProjectSidebar({
  activeViewId,
  project,
  selectedWorkspaceId,
  onCreateWorkspace,
  onDestroyWorkspace,
  onOpenProjectView,
  onOpenWorkspace,
  onRemoveProject,
  workspaces,
}: ProjectSidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const projectHref = `/projects/${project.id}`;
  const projectSettingsHref = `${projectHref}/settings`;
  const navItemClassName = (selected: boolean) =>
    [
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
      selected
        ? "bg-[var(--muted)] text-[var(--foreground)]"
        : "text-[var(--sidebar-muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
    ].join(" ");

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-[var(--background)] text-[var(--sidebar-foreground)]"
      data-slot="project-sidebar"
    >
      {/* Project header — monogram + name */}
      <div
        className="flex h-10 items-center border-b border-[var(--border)] px-3"
        data-slot="project-sidebar-header"
      >
        <div className="-translate-y-px flex w-full items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] text-[12px] font-semibold text-[var(--foreground)]">
              {projectMonogram(project.name)}
            </span>
            <h1 className="truncate text-[16px] font-medium leading-tight tracking-tight text-[var(--foreground)]">
              {project.name}
            </h1>
          </div>
          <div className="flex shrink-0 items-center">
            <Popover onOpenChange={setMenuOpen} open={menuOpen}>
              <PopoverTrigger asChild>
                <Button aria-label="Project actions" size="icon" variant="ghost">
                  <MoreHorizontal size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-44 rounded-lg border-[var(--border)] bg-[var(--panel)] p-1"
                side="bottom"
                sideOffset={8}
              >
                <Link
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                  to={projectSettingsHref}
                >
                  <Settings size={14} />
                  Project settings
                </Link>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-rose-300 hover:bg-[var(--surface-hover)]"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemoveProject();
                  }}
                  type="button"
                >
                  <Trash2 size={14} />
                  Remove project
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Project nav — icon + label, pill selected */}
      <div className="px-2 pt-2">
        <div className="flex flex-col gap-0.5">
          <button
            className={navItemClassName(activeViewId === "overview")}
            onClick={() => onOpenProjectView("overview")}
            type="button"
          >
            <LayoutGrid aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
            Overview
          </button>
          <button
            className={navItemClassName(activeViewId === "pull-requests")}
            onClick={() => onOpenProjectView("pull-requests")}
            type="button"
          >
            <GitPullRequest aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
            Pull Requests
          </button>
          <button
            className={navItemClassName(activeViewId === "activity")}
            onClick={() => onOpenProjectView("activity")}
            type="button"
          >
            <Activity aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
            Activity
          </button>
        </div>
      </div>

      {/* Workspaces — spacing-only section break, no divider */}
      <div className="flex min-h-0 flex-1 flex-col pt-7">
        <div className="flex items-center justify-between px-4 pb-2">
          <p className="app-panel-title text-[var(--muted-foreground)]">Workspaces</p>
          <Button
            aria-label={`Create workspace for ${project.name}`}
            onClick={onCreateWorkspace}
            size="icon"
            variant="ghost"
          >
            <Plus size={14} />
          </Button>
        </div>
        {workspaces.length === 0 ? (
          <div className="px-3 pb-3">
            <EmptyState
              description="Create a workspace to start a live canvas for this project."
              title="No workspaces yet"
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {workspaces.map((workspace) => (
              <WorkspaceTreeItem
                key={workspace.id}
                selected={workspace.id === selectedWorkspaceId}
                workspace={workspace}
                onDestroy={() => onDestroyWorkspace(workspace)}
                onSelect={() => onOpenWorkspace(workspace)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
