import { useOutletContext, useParams } from "react-router-dom";
import type { ProjectRouteOutletContext } from "@/features/projects/routes/project-route";
import { WorkspaceLoader } from "@/features/workspaces/components/workspace-loader";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  const { project } = useOutletContext<ProjectRouteOutletContext>();

  if (!workspaceId) {
    return null;
  }

  return <WorkspaceLoader project={project} workspaceId={workspaceId} />;
}
