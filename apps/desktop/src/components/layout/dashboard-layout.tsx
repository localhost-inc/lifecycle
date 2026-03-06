import { useCallback, useMemo } from "react";
import { Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { addProjectFromDirectory } from "../../features/projects/api/projects";
import { projectKeys, useProjectCatalog } from "../../features/projects/hooks";
import { useSettings } from "../../features/settings/state/app-settings-provider";
import {
  createWorkspace,
  getCurrentBranch,
} from "../../features/workspaces/api";
import {
  useWorkspace,
  useWorkspacesByProject,
  workspaceKeys,
} from "../../features/workspaces/hooks";
import { useStoreClient } from "../../store";
import { Sidebar } from "./sidebar";
import { TitleBar } from "./title-bar";

export function DashboardLayout() {
  const client = useStoreClient();
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const [searchParams] = useSearchParams();
  const { worktreeRoot } = useSettings();
  const projectCatalogQuery = useProjectCatalog();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const workspaceQuery = useWorkspace(workspaceId ?? null);

  const projects = projectCatalogQuery.data?.projects ?? [];
  const manifestStates = useMemo(
    () =>
      projectCatalogQuery.data
        ? Object.fromEntries(
            Object.entries(projectCatalogQuery.data.manifestsByProjectId).map(
              ([projectId, manifest]) => [projectId, manifest.state],
            ),
          )
        : {},
    [projectCatalogQuery.data],
  );
  const workspacesByProjectId = workspacesByProjectQuery.data ?? {};
  const selectedWorkspaceId = workspaceId ?? null;
  const selectedProjectId = workspaceQuery.data?.project_id ?? null;
  const selectedProjectFromQuery = searchParams.get("project");
  const fallbackSelectedProjectId =
    selectedProjectFromQuery && projects.some((project) => project.id === selectedProjectFromQuery)
      ? selectedProjectFromQuery
      : null;
  const activeProjectId = selectedProjectId ?? fallbackSelectedProjectId;

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      void navigate(`/workspaces/${workspaceId}`);
    },
    [navigate],
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      const workspaces = workspacesByProjectId[projectId] ?? [];
      const firstWorkspace = workspaces[0];
      if (firstWorkspace) {
        void navigate(`/workspaces/${firstWorkspace.id}`);
        return;
      }

      void navigate(`/?project=${projectId}`);
    },
    [navigate, workspacesByProjectId],
  );

  const handleAddProject = useCallback(async () => {
    try {
      const project = await addProjectFromDirectory();
      if (!project) return;
      client.invalidate(projectKeys.catalog());
      void navigate(`/?project=${project.id}`);
    } catch (err) {
      console.error("Failed to add project:", err);
      alert(`Failed to add project: ${err}`);
    }
  }, [client, navigate]);

  const handleCreateWorkspace = useCallback(
    async (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;

      try {
        const branch = await getCurrentBranch(project.path);
        const workspaceId = await createWorkspace({
          projectId: project.id,
          baseRef: branch,
          projectPath: project.path,
          worktreeRoot,
        });
        client.invalidate(workspaceKeys.byProject());
        client.invalidate(workspaceKeys.detail(workspaceId));
        void navigate(`/workspaces/${workspaceId}`);
      } catch (err) {
        console.error("Failed to create workspace:", err);
        alert(`Failed to create workspace: ${err}`);
      }
    },
    [client, navigate, projects, worktreeRoot],
  );

  const handleOpenSettings = useCallback(() => {
    void navigate("/settings/general");
  }, [navigate]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          isLoading={projectCatalogQuery.isLoading || workspacesByProjectQuery.isLoading}
          projects={projects}
          manifestStates={manifestStates}
          workspacesByProjectId={workspacesByProjectId}
          selectedProjectId={activeProjectId}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectProject={handleSelectProject}
          onSelectWorkspace={handleSelectWorkspace}
          onAddProject={handleAddProject}
          onCreateWorkspace={handleCreateWorkspace}
          onOpenSettings={handleOpenSettings}
        />
        <main className="flex min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
