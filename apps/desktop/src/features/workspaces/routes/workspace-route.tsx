import { useOutletContext, useParams } from "react-router-dom";
import type { ProjectRouteOutletContext } from "@/features/projects/routes/project-route";
import { WorkspaceNavBar } from "@/features/workspaces/navbar/workspace-nav-bar";
import { WorkspaceLoader } from "@/features/workspaces/components/workspace-loader";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  const { project } = useOutletContext<ProjectRouteOutletContext>();

  if (!workspaceId) {
    return null;
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col bg-[var(--background)]"
      data-slot="workspace-shell"
    >
      <WorkspaceNavBar
        activeWorkspaceId={workspaceId}
        projectName={project.name}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-tl-lg border-l border-t border-[var(--border)] bg-[var(--surface)]">
        <WorkspaceLoader workspaceId={workspaceId} />
      </div>
    </div>
  );
}
