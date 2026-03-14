import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { Badge, Button, Card } from "@lifecycle/ui";
import { ArrowUpRight, Layers, Sparkles } from "lucide-react";
import { formatRelativeTime } from "../../../lib/format";
import { getWorkspaceDisplayName, isRootWorkspace } from "../../workspaces/lib/workspace-display";
import { WorkspaceRootIndicator } from "../../workspaces/components/workspace-root-indicator";

interface ProjectOverviewSurfaceProps {
  project: ProjectRecord;
  workspaces: WorkspaceRecord[];
  onCreateWorkspace: () => void;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
}

const workspaceStatusBadgeVariant = {
  active: "success",
  idle: "muted",
  starting: "info",
  stopping: "warning",
} as const;

const workspaceStatusLabel = {
  active: "Active",
  idle: "Idle",
  starting: "Starting",
  stopping: "Stopping",
} as const;

export function ProjectOverviewSurface({
  project,
  workspaces,
  onCreateWorkspace,
  onOpenWorkspace,
}: ProjectOverviewSurfaceProps) {
  const recentWorkspaces = [...workspaces]
    .sort((left, right) => Date.parse(right.last_active_at) - Date.parse(left.last_active_at))
    .slice(0, 6);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-[var(--border)] px-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Overview
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{project.name}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              Durable project context lives here. Open a workspace when you need live terminals,
              files, previews, and local changes.
            </p>
          </div>
          <Button onClick={onCreateWorkspace}>
            <Sparkles size={14} strokeWidth={2.2} />
            New workspace
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 px-8 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-xl border-[var(--border)] p-5">
            <p className="text-sm text-[var(--muted-foreground)]">Open workspaces</p>
            <p className="mt-3 text-3xl font-semibold text-[var(--foreground)]">
              {workspaces.length}
            </p>
          </Card>
          <Card className="rounded-xl border-[var(--border)] p-5">
            <p className="text-sm text-[var(--muted-foreground)]">Project path</p>
            <p className="mt-3 truncate font-mono text-sm text-[var(--foreground)]">
              {project.path}
            </p>
          </Card>
          <Card className="rounded-xl border-[var(--border)] p-5">
            <p className="text-sm text-[var(--muted-foreground)]">Next step</p>
            <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">
              Use a workspace tab for execution. Shared project artifacts like pull requests and
              project activity now live in project-level tabs instead of the workspace side panel.
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Workspaces</h3>
          </div>
          {recentWorkspaces.length === 0 ? (
            <Card className="rounded-xl border-dashed p-8 text-center">
              <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                <Layers className="size-5 text-[var(--muted-foreground)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">No workspaces yet</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    Create a workspace to open a live workbench for this project.
                  </p>
                </div>
                <Button onClick={onCreateWorkspace}>Create workspace</Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {recentWorkspaces.map((workspace) => {
                const displayName = getWorkspaceDisplayName(workspace);

                return (
                  <button
                    key={workspace.id}
                    aria-label={`Open workspace ${displayName}`}
                    className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-colors hover:bg-[var(--surface-hover)]"
                    onClick={() => onOpenWorkspace(workspace)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {isRootWorkspace(workspace) ? <WorkspaceRootIndicator /> : null}
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                            {displayName}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          Last active {formatRelativeTime(workspace.last_active_at)}
                        </p>
                      </div>
                      <Badge variant={workspaceStatusBadgeVariant[workspace.status]}>
                        {workspaceStatusLabel[workspace.status]}
                      </Badge>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--foreground)]">
                      Open workspace
                      <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
