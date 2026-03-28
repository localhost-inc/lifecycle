import type { WorkspaceRecord } from "@lifecycle/contracts";
import { Card, EmptyState } from "@lifecycle/ui";
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { getWorkspaceActivityEvents } from "@/features/events";
import { formatRelativeTime } from "@/lib/format";
import { WorkspaceActivityFeed } from "@/features/workspaces/components/workspace-activity-feed";
import { getWorkspaceDisplayName } from "@/features/workspaces/lib/workspace-display";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { buildWorkspaceActivityItems } from "@/features/workspaces/state/workspace-activity";
import type { ProjectRouteOutletContext } from "@/features/projects/routes/project-route";

function ProjectActivityWorkspaceSection({
  workspace,
  onOpenWorkspace,
}: {
  workspace: WorkspaceRecord;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
}) {
  return (
    <ProjectActivityWorkspaceSectionContent
      onOpenWorkspace={onOpenWorkspace}
      workspace={workspace}
    />
  );
}

function ProjectActivityWorkspaceSectionContent({
  workspace,
  onOpenWorkspace,
}: {
  workspace: WorkspaceRecord;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
}) {
  const activityQuery = useQuery({
    queryKey: workspaceKeys.activity(workspace.id),
    queryFn: async () => getWorkspaceActivityEvents(workspace.id),
  });
  const items = useMemo(
    () => buildWorkspaceActivityItems(activityQuery.data ?? []),
    [activityQuery.data],
  );

  return (
    <Card className="rounded-xl border-[var(--border)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            className="text-left text-sm font-semibold text-[var(--foreground)] hover:underline"
            onClick={() => onOpenWorkspace(workspace)}
            type="button"
          >
            {getWorkspaceDisplayName(workspace)}
          </button>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Last active {formatRelativeTime(workspace.last_active_at)}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <WorkspaceActivityFeed items={items.slice(0, 4)} />
      </div>
    </Card>
  );
}

export function ProjectActivitySurface() {
  const { project, workspaces } = useOutletContext<ProjectRouteOutletContext>();
  const navigate = useNavigate();

  const onOpenWorkspace = useCallback(
    (workspace: WorkspaceRecord) => {
      void navigate(`/projects/${project.id}/workspaces/${workspace.id}`);
    },
    [navigate, project.id],
  );
  const recentWorkspaces = [...workspaces].sort(
    (left, right) => Date.parse(right.last_active_at) - Date.parse(left.last_active_at),
  );

  if (recentWorkspaces.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          description="Create a workspace to start collecting project activity."
          title="No project activity yet"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-8 py-8">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Activity
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">Project activity</h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {recentWorkspaces.map((workspace) => (
          <ProjectActivityWorkspaceSection
            key={workspace.id}
            onOpenWorkspace={onOpenWorkspace}
            workspace={workspace}
          />
        ))}
      </div>
    </div>
  );
}
