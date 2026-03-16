import { useCallback } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { ProjectRouteOutletContext } from "../../projects/routes/project-route";
import { WorkspaceTabContent } from "../components/workspace-tab-content";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  const { project } = useOutletContext<ProjectRouteOutletContext>();
  const navigate = useNavigate();

  const handleOpenPullRequest = useCallback(
    (pullRequest: { number: number }) => {
      void navigate(`/projects/${project.id}/pulls/${pullRequest.number}`);
    },
    [navigate, project.id],
  );

  if (!workspaceId) {
    return null;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-slot="workspace">
      <WorkspaceTabContent onOpenPullRequest={handleOpenPullRequest} workspaceId={workspaceId} />
    </div>
  );
}
