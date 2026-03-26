import { useOutletContext, useParams } from "react-router-dom";
import type { ProjectRouteOutletContext } from "@/features/projects/routes/project-route";
import { WorkspaceLoader } from "@/features/workspaces/components/workspace-loader";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  useOutletContext<ProjectRouteOutletContext>();

  if (!workspaceId) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden" data-slot="workspace-shell">
      <WorkspaceLoader workspaceId={workspaceId} />
    </div>
  );
}
