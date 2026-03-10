import { useSearchParams, useOutletContext } from "react-router-dom";
import { Layers } from "lucide-react";
import { Button, EmptyState } from "@lifecycle/ui";
import { useProjectCatalog } from "../../projects/hooks";

interface DashboardOutletContext {
  onCreateWorkspace: (projectId: string) => void;
}

export function DashboardIndexRoute() {
  const [searchParams] = useSearchParams();
  const { onCreateWorkspace } = useOutletContext<DashboardOutletContext>();
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
      <EmptyState
        icon={<Layers />}
        title="No workspace selected"
        description={
          selectedProject
            ? `Project ${selectedProject.name} has no active workspace yet.`
            : "This project has no active workspace yet."
        }
        action={
          <Button
            variant="secondary"
            onClick={() => onCreateWorkspace(selectedProjectId)}
          >
            + New workspace
          </Button>
        }
      />
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
