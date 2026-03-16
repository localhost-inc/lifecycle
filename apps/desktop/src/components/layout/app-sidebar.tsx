import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import {
  IconButton,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Spinner,
} from "@lifecycle/ui";
import {
  ChevronDown,
  CircleUserRound,
  Megaphone,
  PanelLeftClose,
  Plus,
  Settings,
} from "lucide-react";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { resolveProjectRepoWorkspace } from "../../features/projects/lib/project-repo-workspace";
import {
  readProjectPaths,
  resolveProjectNavigationTarget,
} from "../../features/projects/state/project-content-tabs";
import { ResponseReadyDot } from "../response-ready-dot";
import { Wordmark } from "../wordmark";
import { openUrl } from "@tauri-apps/plugin-opener";
import { bugs, version } from "../../../package.json";
import type { AuthSession } from "../../features/auth/auth-session";

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

function authAvatarHue(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

function AuthSessionAvatar({
  loading,
  session,
  size = 20,
}: {
  loading: boolean;
  session: AuthSession;
  size?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const identity = session.identity;
  const avatarUrl = session.state === "logged_in" ? (identity?.avatarUrl ?? null) : null;
  const avatarSeed = identity?.handle ?? identity?.displayName ?? session.provider ?? "lifecycle";
  const sizeClass = size === 24 ? "size-6" : "size-5";
  const textSize = size === 24 ? "text-[11px]" : "text-[10px]";

  if (loading) {
    return (
      <span
        className={`flex ${sizeClass} items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--foreground),transparent_90%)] text-[var(--muted-foreground)]`}
      >
        <Spinner className="size-3" />
      </span>
    );
  }

  if (avatarUrl && !imageFailed) {
    return (
      <img
        alt={identity?.displayName ?? identity?.handle ?? "Account"}
        className={`${sizeClass} shrink-0 rounded-full`}
        onError={() => setImageFailed(true)}
        src={avatarUrl}
      />
    );
  }

  if (session.state === "logged_in") {
    const letter = (identity?.displayName ?? identity?.handle ?? "L").charAt(0).toUpperCase();
    return (
      <span
        className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full ${textSize} font-semibold leading-none text-white`}
        style={{ backgroundColor: `hsl(${authAvatarHue(avatarSeed)}, 48%, 44%)` }}
      >
        {letter}
      </span>
    );
  }

  return (
    <span
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--foreground),transparent_92%)] text-[var(--muted-foreground)]`}
    >
      <CircleUserRound size={size === 24 ? 14 : 12} strokeWidth={1.8} />
    </span>
  );
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
          {/* Avatar */}
          <div className="flex shrink-0 items-center justify-center pt-1 pb-3">
            <button
              aria-label={activeContextName}
              onClick={onOpenSettings}
              title={activeContextName}
              type="button"
            >
              <AuthSessionAvatar loading={authSessionLoading} session={authSession} size={24} />
            </button>
          </div>

          {/* Project monograms */}
          <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
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
                        ? "bg-[var(--sidebar-selected)] text-[var(--sidebar-foreground)]"
                        : "text-[var(--sidebar-muted-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]",
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
              <button
                aria-label="Add project"
                className="flex size-8 items-center justify-center rounded-lg text-[var(--sidebar-muted-foreground)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
                onClick={onAddProject}
                type="button"
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Footer icons */}
          <div className="flex flex-col items-center gap-1 pb-2 pt-1">
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
        <button
          aria-label="Collapse sidebar"
          className="flex size-6 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          type="button"
        >
          <PanelLeftClose size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Context switcher */}
        <div className="px-4 pb-3">
          <button
            aria-label={`Open ${activeContextName} context`}
            className="flex w-full items-center gap-2 text-left"
            data-slot="app-sidebar-context"
            onClick={onOpenSettings}
            type="button"
          >
            <AuthSessionAvatar loading={authSessionLoading} session={authSession} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--sidebar-foreground)]">
              {activeContextName}
            </span>
            <ChevronDown
              className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
              strokeWidth={2}
            />
          </button>
        </div>

        {/* Project list */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-4 pb-1">
            <p className="app-panel-title text-[var(--muted-foreground)]">Projects</p>
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
                      "relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                      selected
                        ? "bg-[var(--sidebar-selected)] text-[var(--sidebar-foreground)]"
                        : "text-[var(--sidebar-muted-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]",
                    ].join(" ")}
                    to={projectPaths[project.id] ?? `/projects/${project.id}`}
                    title={project.name}
                  >
                    <span
                      className={[
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold uppercase",
                        selected
                          ? "bg-[color-mix(in_srgb,var(--foreground),transparent_86%)] text-[var(--foreground)]"
                          : "bg-[color-mix(in_srgb,var(--foreground),transparent_92%)] text-[var(--foreground)]",
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

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-[var(--sidebar-muted-foreground)]"
                onClick={() => openUrl(bugs.url)}
                size="sm"
              >
                <Megaphone />
                <span>Feedback</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-[var(--sidebar-muted-foreground)]"
                onClick={onOpenSettings}
                size="sm"
              >
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center gap-2 px-2 pb-0.5 text-[var(--muted-foreground)]">
            <Wordmark className="h-[11px] w-auto" />
            <span className="font-mono text-[10px]">v{version}</span>
          </div>
        </SidebarFooter>
      </div>
    </aside>
  );
}
