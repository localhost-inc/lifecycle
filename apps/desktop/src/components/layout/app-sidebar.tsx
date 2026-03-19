import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import {
  IconButton,
  Logo,
  Wordmark,
} from "@lifecycle/ui";
import {
  Megaphone,
  PanelLeftClose,
  Plus,
  Settings,
} from "lucide-react";
import { type MouseEvent, useCallback, useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { resolveProjectRepoWorkspace } from "../../features/projects/lib/project-repo-workspace";
import {
  readProjectPaths,
  resolveProjectNavigationTarget,
} from "../../features/projects/state/project-content-tabs";
import { UserAvatar } from "../../features/user/components/user-avatar";
import { ResponseReadyDot } from "../response-ready-dot";
import type { AuthSession } from "../../features/auth/auth-session";
import { openUrl } from "@tauri-apps/plugin-opener";
import { bugs, version } from "../../../package.json";

const COLLAPSED_WIDTH = 48;

interface AppSidebarProps {
  activeContextName: string;
  authSession: AuthSession;
  authSessionLoading: boolean;
  collapsed: boolean;
  onAddProject: () => void;
  onOpenSettings: () => void;
  onToggleCollapse: () => void;
  projects: ProjectRecord[];
  readyProjectIds: ReadonlySet<string>;
  workspacesByProjectId: Record<string, WorkspaceRecord[]>;
  width: number;
}

function projectMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppSidebar({
  activeContextName,
  authSession,
  authSessionLoading,
  collapsed,
  onAddProject,
  onOpenSettings,
  onToggleCollapse,
  projects,
  readyProjectIds,
  workspacesByProjectId,
  width,
}: AppSidebarProps) {
  const { projectId } = useParams();
  const location = useLocation();

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

  if (collapsed) {
    return (
      <aside
        className="flex h-full min-h-0 shrink-0 flex-col items-center bg-[var(--background)] text-[var(--sidebar-foreground)]"
        data-slot="app-sidebar"
        onMouseDown={handleMouseDown}
        style={{ width: `${COLLAPSED_WIDTH}px` }}
      >
        {/* Spacer to align below nav bar — no border in traffic light zone */}
        <div className="h-10 w-full shrink-0" />

        <div className="flex min-h-0 w-full flex-1 flex-col items-center">
          {/* Avatar (org context) */}
          <div className="flex shrink-0 items-center justify-center py-1 pb-2">
            <button
              aria-label={activeContextName}
              onClick={onOpenSettings}
              title={activeContextName}
              type="button"
            >
              <UserAvatar loading={authSessionLoading} session={authSession} size={28} />
            </button>
          </div>

          {/* Project monograms */}
          <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-1 pt-1">
            <div className="flex flex-col gap-1">
              {projects.map((project) => {
                const selected = project.id === projectId;
                const responseReady = readyProjectIds.has(project.id);

                return (
                  <Link
                    key={project.id}
                    aria-label={project.name}
                    className={[
                      "relative flex size-8 items-center justify-center rounded-lg text-[11px] font-semibold uppercase transition-colors",
                      selected
                        ? "bg-[var(--card)] text-[var(--sidebar-foreground)] shadow-[0_0_0_0.5px_var(--border)]"
                        : "text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)]",
                    ].join(" ")}
                    to={projectPaths[project.id] ?? `/projects/${project.id}`}
                    title={project.name}
                  >
                    {projectMonogram(project.name)}
                    {responseReady ? (
                      <ResponseReadyDot className="absolute -right-0.5 -top-0.5 scale-75" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
            {/* Add project — below project list */}
            <button
              aria-label="Add project"
              className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-muted-foreground)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
              onClick={onAddProject}
              title="Add project"
              type="button"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>

          {/* Feedback & settings */}
          <div className="flex shrink-0 flex-col items-center gap-1 pt-2 pb-1.5">
            <button
              aria-label="Feedback"
              className="flex size-8 items-center justify-center rounded-lg text-[var(--sidebar-muted-foreground)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
              onClick={() => openUrl(bugs.url)}
              title="Feedback"
              type="button"
            >
              <Megaphone size={16} strokeWidth={2} />
            </button>
            <button
              aria-label="Settings"
              className="flex size-8 items-center justify-center rounded-lg text-[var(--sidebar-muted-foreground)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
              onClick={onOpenSettings}
              title="Settings"
              type="button"
            >
              <Settings size={16} strokeWidth={2} />
            </button>
          </div>

          {/* Logo at bottom */}
          <div className="flex shrink-0 items-center justify-center pb-3">
            <Logo size={20} className="text-[var(--sidebar-muted-foreground)]" />
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col bg-[var(--background)] text-[var(--sidebar-foreground)]"
      data-slot="app-sidebar"
      onMouseDown={handleMouseDown}
      style={{ width: `${width}px` }}
    >
      {/* Collapse button — inline with traffic lights */}
      <div className="flex h-10 shrink-0 items-center justify-end px-2">
        <IconButton
          aria-label="Collapse sidebar"
          onClick={onToggleCollapse}
          title="Collapse sidebar"
        >
          <PanelLeftClose size={14} strokeWidth={2} />
        </IconButton>
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

        {/* Project list */}
        <div className="flex min-h-0 flex-1 flex-col pt-2">
          <div className="flex items-center justify-between pl-4 pr-2 pb-1">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">Projects</p>
            <IconButton aria-label="Add project" onClick={onAddProject}>
              <Plus className="size-3.5" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            <div className="flex flex-col gap-0.5">
              {projects.map((project) => {
                const selected = project.id === projectId;
                const responseReady = readyProjectIds.has(project.id);

                return (
                  <Link
                    key={project.id}
                    aria-label={`Open project ${project.name}`}
                    className={[
                      "relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                      selected
                        ? "bg-[var(--card)] text-[var(--sidebar-foreground)] shadow-[0_0_0_0.5px_var(--border)]"
                        : "text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)]",
                    ].join(" ")}
                    to={projectPaths[project.id] ?? `/projects/${project.id}`}
                    title={project.name}
                  >
                    <span
                      className={[
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold uppercase",
                        selected
                          ? "bg-[var(--muted)] text-[var(--foreground)]"
                          : "bg-[var(--surface-hover)] text-[var(--foreground)]",
                      ].join(" ")}
                    >
                      {projectMonogram(project.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {responseReady ? <ResponseReadyDot className="shrink-0 scale-[0.85]" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Feedback & settings */}
        <div className="flex shrink-0 flex-col gap-0.5 px-2 pt-2 pb-1.5">
          <button
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[var(--sidebar-muted-foreground)] transition-colors hover:text-[var(--sidebar-foreground)]"
            onClick={() => openUrl(bugs.url)}
            type="button"
          >
            <Megaphone className="size-4 shrink-0" strokeWidth={2} />
            <span>Feedback</span>
          </button>
          <button
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[var(--sidebar-muted-foreground)] transition-colors hover:text-[var(--sidebar-foreground)]"
            onClick={onOpenSettings}
            type="button"
          >
            <Settings className="size-4 shrink-0" strokeWidth={2} />
            <span>Settings</span>
          </button>
        </div>

        {/* Wordmark + version at bottom */}
        <div className="flex shrink-0 items-center px-4 pb-3 pt-1">
          <Wordmark className="h-3 text-[var(--sidebar-muted-foreground)]" />
          <span className="ml-auto font-mono text-[11px] text-[var(--sidebar-muted-foreground)]">v{version}</span>
        </div>
      </div>
    </aside>
  );
}
