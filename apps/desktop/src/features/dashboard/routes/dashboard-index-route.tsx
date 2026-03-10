import type { WorkspaceRecord, WorkspaceStatus } from "@lifecycle/contracts";
import { useMemo } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { ArrowUpRight, History, Layers, Sparkles } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@lifecycle/ui";
import { formatRelativeTime } from "../../../lib/format";
import { useProjectCatalog } from "../../projects/hooks";
import { useWorkspacesByProject } from "../../workspaces/hooks";
import { readLastWorkspaceId } from "../../workspaces/state/workspace-surface-state";

interface DashboardOutletContext {
  onCreateWorkspace: (projectId: string) => void;
}

const RECENT_WORKSPACE_LIMIT = 4;

const workspaceStatusBadgeVariant: Record<
  WorkspaceStatus,
  "info" | "muted" | "success" | "warning"
> = {
  active: "success",
  idle: "muted",
  starting: "info",
  stopping: "warning",
};

const workspaceStatusLabel: Record<WorkspaceStatus, string> = {
  active: "Active",
  idle: "Idle",
  starting: "Starting",
  stopping: "Stopping",
};

function getWorkspaceActivityTimestamp(workspace: WorkspaceRecord): number {
  const timestamp = Date.parse(workspace.last_active_at);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getRecentWorkspaces(
  workspaces: WorkspaceRecord[],
  lastWorkspaceId: string | null,
): WorkspaceRecord[] {
  return [...workspaces]
    .sort((left, right) => {
      const leftPinned = left.id === lastWorkspaceId;
      const rightPinned = right.id === lastWorkspaceId;

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      return getWorkspaceActivityTimestamp(right) - getWorkspaceActivityTimestamp(left);
    })
    .slice(0, RECENT_WORKSPACE_LIMIT);
}

function safeReadLastWorkspaceId(): string | null {
  try {
    return readLastWorkspaceId();
  } catch {
    return null;
  }
}

export function DashboardIndexRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { onCreateWorkspace } = useOutletContext<DashboardOutletContext>();
  const projectCatalogQuery = useProjectCatalog();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const projects = projectCatalogQuery.data?.projects ?? [];
  const workspacesByProject = workspacesByProjectQuery.data ?? {};
  const workspaces = useMemo(
    () => Object.values(workspacesByProject).flat(),
    [workspacesByProject],
  );
  const selectedProjectId = searchParams.get("project");
  const lastWorkspaceId = safeReadLastWorkspaceId();
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const recentWorkspaces = useMemo(
    () => getRecentWorkspaces(workspaces, lastWorkspaceId),
    [lastWorkspaceId, workspaces],
  );
  const hasWorkspaceHistory = recentWorkspaces.length > 0;
  const canQuickCreateWorkspace =
    workspacesByProjectQuery.data !== undefined && workspaces.length === 0;
  const quickCreateProjects = useMemo(() => projects.slice(0, RECENT_WORKSPACE_LIMIT), [projects]);
  const defaultTitle = canQuickCreateWorkspace
    ? "Create your first workspace"
    : "Select a workspace";
  const defaultDescription = canQuickCreateWorkspace
    ? "Pick a project from the sidebar to spin up a workspace, watch setup output, and manage services from one place."
    : "Choose a workspace from the sidebar to view status, setup output, and services.";

  if (projectCatalogQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Loading projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">No projects yet</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Add a project from the sidebar to get started.
          </p>
        </div>
      </div>
    );
  }

  if (selectedProjectId) {
    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    return (
      <EmptyState
        icon={<Layers />}
        title="No workspace selected"
        description={
          selectedProject
            ? `Project ${selectedProject.name} has no active workspace yet.`
            : "This project has no active workspace yet."
        }
        action={
          <Button onClick={() => onCreateWorkspace(selectedProjectId)}>+ New workspace</Button>
        }
      />
    );
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--foreground)_9%,transparent),transparent_62%)]" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Card className="overflow-hidden rounded-[28px] border-[color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color-mix(in_srgb,var(--card)_94%,transparent)] shadow-[0_24px_80px_color-mix(in_srgb,var(--foreground)_12%,transparent)] backdrop-blur-sm">
          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--foreground)_18%,transparent),transparent)]" />
            <div className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-[22px] border border-[color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color-mix(in_srgb,var(--background)_65%,var(--card))] text-[var(--foreground)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_7%,transparent)]">
                <Layers className="size-7" />
              </div>
              <Badge className="mt-5 border border-[var(--border)]/70" variant="muted">
                Workspace dashboard
              </Badge>
              <h2 className="mt-4 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold tracking-tight text-[var(--foreground)]">
                {defaultTitle}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-[15px]">
                {defaultDescription}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_52%,transparent)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
                  {projects.length} {projects.length === 1 ? "project" : "projects"}
                </span>
                <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_52%,transparent)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
                  {workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}
                </span>
                {hasWorkspaceHistory ? (
                  <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_52%,transparent)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
                    Recent workspaces ready
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        {hasWorkspaceHistory ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                Recent workspaces
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Pinned from your last session when available
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {recentWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  aria-label={`Open workspace ${workspace.name}`}
                  className="group rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_92%,transparent)] p-5 text-left transition-transform duration-150 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--foreground)_20%,var(--border))] hover:bg-[color-mix(in_srgb,var(--card)_98%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  onClick={() => void navigate(`/workspaces/${workspace.id}`)}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_60%,var(--card))] text-[var(--foreground)]">
                      <History className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                          {workspace.name}
                        </p>
                        {workspace.id === lastWorkspaceId ? (
                          <Badge variant="secondary">Last opened</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                        {projectNameById.get(workspace.project_id) ?? "Unknown project"}
                      </p>
                    </div>
                    <Badge variant={workspaceStatusBadgeVariant[workspace.status]}>
                      {workspaceStatusLabel[workspace.status]}
                    </Badge>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
                    <span>Last active {formatRelativeTime(workspace.last_active_at)}</span>
                    <span className="inline-flex items-center gap-1 text-[var(--foreground)] transition-transform group-hover:translate-x-0.5">
                      Open
                      <ArrowUpRight className="size-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : canQuickCreateWorkspace ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                Start from a project
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Create a workspace without leaving this screen
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {quickCreateProjects.map((project) => (
                <button
                  key={project.id}
                  aria-label={`Create workspace for ${project.name}`}
                  className="group rounded-[22px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_92%,transparent)] p-5 text-left transition-transform duration-150 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--foreground)_20%,var(--border))] hover:bg-[color-mix(in_srgb,var(--card)_98%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  onClick={() => onCreateWorkspace(project.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_60%,var(--card))] text-[var(--foreground)]">
                      <Sparkles className="size-4.5" />
                    </div>
                    <ArrowUpRight className="size-4 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <p className="mt-8 text-sm font-semibold text-[var(--foreground)]">
                    {project.name}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                    Create a workspace and jump straight into setup output, service health, and
                    runtime status.
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Card className="rounded-[22px] border-dashed bg-[color-mix(in_srgb,var(--card)_88%,transparent)]">
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <History className="size-5 text-[var(--muted-foreground)]" />
              <p className="text-sm font-medium text-[var(--foreground)]">
                Loading workspace history
              </p>
              <p className="max-w-md text-xs leading-5 text-[var(--muted-foreground)]">
                Recent workspaces appear here once the sidebar state finishes syncing.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
