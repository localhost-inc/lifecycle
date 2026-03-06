import { useSearchParams } from "react-router-dom";
import { useProjectCatalog } from "../../projects/hooks";

export function DashboardIndexRoute() {
  const [searchParams] = useSearchParams();
  const projectCatalogQuery = useProjectCatalog();
  const projects = projectCatalogQuery.data?.projects ?? [];
  const selectedProjectId = searchParams.get("project");

  if (projectCatalogQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Loading projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">No projects yet</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Add a project from the sidebar to get started.
          </p>
        </div>
      </div>
    );
  }

  if (selectedProjectId) {
    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">No workspace selected</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {selectedProject
              ? `Project ${selectedProject.name} has no active workspace yet.`
              : "This project has no active workspace yet."}
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Create a workspace from the project row in the sidebar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Select a workspace</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Choose a workspace from the sidebar to view status, setup output, and services.
        </p>
      </div>
    </div>
  );
}
