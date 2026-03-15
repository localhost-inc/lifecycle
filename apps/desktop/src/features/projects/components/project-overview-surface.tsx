import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { Button, StatusDot, type StatusDotTone } from "@lifecycle/ui";
import { ArrowUpRight, FolderGit2, GitBranch, Layers, Plus } from "lucide-react";
import { formatRelativeTime } from "../../../lib/format";
import { getWorkspaceDisplayName, isRootWorkspace } from "../../workspaces/lib/workspace-display";

interface ProjectOverviewSurfaceProps {
  project: ProjectRecord;
  workspaces: WorkspaceRecord[];
  onCreateWorkspace: () => void;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
}

const statusDotTone: Record<WorkspaceRecord["status"], StatusDotTone> = {
  active: "success",
  idle: "neutral",
  starting: "info",
  stopping: "warning",
};

const statusLabel: Record<WorkspaceRecord["status"], string> = {
  active: "Active",
  idle: "Idle",
  starting: "Starting",
  stopping: "Stopping",
};

export function ProjectOverviewSurface({
  project,
  workspaces,
  onCreateWorkspace,
  onOpenWorkspace,
}: ProjectOverviewSurfaceProps) {
  const recentWorkspaces = [...workspaces]
    .sort((left, right) => Date.parse(right.last_active_at) - Date.parse(left.last_active_at))
    .slice(0, 6);

  const activeCount = workspaces.filter((w) => w.status === "active").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-10 pt-10 pb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Overview
        </p>
        <h2 className="mt-2 text-4xl font-bold tracking-tight text-[var(--foreground)]">
          {project.name}
        </h2>
        <p className="mt-2 font-mono text-xs text-[var(--muted-foreground)]">{project.path}</p>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-8 px-10 pb-10">
        {/* Workspaces section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Workspaces</h3>
              {workspaces.length > 0 && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  {activeCount > 0
                    ? `${activeCount} active · ${workspaces.length} total`
                    : `${workspaces.length} total`}
                </span>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={onCreateWorkspace}>
              <Plus size={14} strokeWidth={2.2} />
              New workspace
            </Button>
          </div>

          {recentWorkspaces.length === 0 ? (
            <button
              className="group rounded-xl border border-dashed border-[var(--border)] p-10 text-center transition-colors hover:border-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"
              onClick={onCreateWorkspace}
              type="button"
            >
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-selected)]">
                  <Layers className="size-4 text-[var(--muted-foreground)]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">No workspaces yet</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    Create a workspace to open a live canvas with terminals, files, and previews.
                  </p>
                </div>
              </div>
            </button>
          ) : (
            <div className="grid gap-2">
              {recentWorkspaces.map((workspace) => {
                const displayName = getWorkspaceDisplayName(workspace);
                const isActive = workspace.status === "active";

                return (
                  <button
                    key={workspace.id}
                    aria-label={`Open workspace ${displayName}`}
                    className="group flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
                    onClick={() => onOpenWorkspace(workspace)}
                    type="button"
                  >
                    {/* Status dot */}
                    <StatusDot
                      tone={statusDotTone[workspace.status]}
                      pulse={isActive}
                    />

                    {/* Name + branch */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="truncate text-sm font-medium text-[var(--foreground)]">
                        {displayName}
                      </span>
                      {isRootWorkspace(workspace) && (
                        <FolderGit2
                          size={12}
                          strokeWidth={2}
                          className="shrink-0 text-[var(--muted-foreground)]"
                        />
                      )}
                    </div>

                    {/* Branch */}
                    {workspace.source_ref && (
                      <div className="hidden items-center gap-1.5 text-xs text-[var(--muted-foreground)] sm:flex">
                        <GitBranch size={12} strokeWidth={2} />
                        <span className="max-w-[180px] truncate font-mono">
                          {workspace.source_ref}
                        </span>
                      </div>
                    )}

                    {/* Status label */}
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                      {statusLabel[workspace.status]}
                    </span>

                    {/* Last active */}
                    <span className="hidden shrink-0 text-xs text-[var(--muted-foreground)] lg:block">
                      {formatRelativeTime(workspace.last_active_at)}
                    </span>

                    {/* Open arrow */}
                    <ArrowUpRight className="size-3.5 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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
