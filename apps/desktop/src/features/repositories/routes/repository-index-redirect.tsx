import { Navigate, useOutletContext } from "react-router-dom";
import type { RepositoryRouteOutletContext } from "@/features/repositories/routes/repository-route";

export function RepositoryIndexRedirect() {
  const { repository, repositoryWorkspace } = useOutletContext<RepositoryRouteOutletContext>();

  if (repositoryWorkspace) {
    return (
      <Navigate
        replace
        to={`/repositories/${repository.id}/workspaces/${repositoryWorkspace.id}`}
      />
    );
  }

  return null;
}
