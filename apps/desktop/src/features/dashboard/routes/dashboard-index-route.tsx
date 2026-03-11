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
    <div className="flex flex-1 items-center justify-center px-6 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col items-center text-center px-2 py-6">
          <div className="flex size-10 items-center justify-center rounded-xl text-[var(--muted-foreground)]">
            <Layers className="size-5" />
          </div>
          <h2 className="mt-4 text-lg font-medium text-[var(--foreground)]">
            {defaultTitle}
          </h2>
          <p className="mt-1.5 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
            {defaultDescription}
          </p>
        </div>

        {hasWorkspaceHistory ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <p className="app-panel-title">Recent workspaces</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {recentWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  aria-label={`Open workspace ${workspace.name}`}
                  className="group rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  onClick={() => void navigate(`/workspaces/${workspace.id}`)}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)]">
                      <History className="size-4" />
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
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
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
              <p className="app-panel-title">Start from a project</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {quickCreateProjects.map((project) => (
                <button
                  key={project.id}
                  aria-label={`Create workspace for ${project.name}`}
                  className="group rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  onClick={() => onCreateWorkspace(project.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex size-8 items-center justify-center rounded-lg text-[var(--muted-foreground)]">
                      <Sparkles className="size-4" />
                    </div>
                    <ArrowUpRight className="size-4 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">
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
          <Card className="rounded-lg border-dashed">
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
