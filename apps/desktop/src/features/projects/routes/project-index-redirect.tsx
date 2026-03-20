import { Navigate, useOutletContext } from "react-router-dom";
import type { ProjectRouteOutletContext } from "@/features/projects/routes/project-route";

export function ProjectIndexRedirect() {
  const { project, repositoryWorkspace } = useOutletContext<ProjectRouteOutletContext>();

  if (repositoryWorkspace) {
    return <Navigate replace to={`/projects/${project.id}/workspaces/${repositoryWorkspace.id}`} />;
  }

  return null;
}
