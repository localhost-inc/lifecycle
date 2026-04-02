import { useOutletContext, useParams } from "react-router-dom";
import type { RepositoryRouteOutletContext } from "@/features/repositories/routes/repository-route";
import { WorkspaceLoader } from "@/features/workspaces/components/workspace-loader";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  const { repository } = useOutletContext<RepositoryRouteOutletContext>();

  if (!workspaceId) {
    return null;
  }

  return <WorkspaceLoader repository={repository} workspaceId={workspaceId} />;
}
