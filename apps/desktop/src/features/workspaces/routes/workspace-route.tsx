import { useOutletContext, useParams } from "react-router-dom";
import type { ProjectRouteOutletContext } from "../../projects/routes/project-route";
import { WorkspaceTabContent } from "../components/workspace-tab-content";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  useOutletContext<ProjectRouteOutletContext>();

  if (!workspaceId) {
    return null;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-slot="workspace">
      <WorkspaceTabContent workspaceId={workspaceId} />
    </div>
  );
}
