import { useCallback } from "react";
import {
  type LoaderFunctionArgs,
  Outlet,
  useLoaderData,
  useMatches,
  useNavigate,
  useRevalidator,
} from "react-router-dom";
import type { ProjectRecord } from "@lifecycle/contracts";
import { ROUTE_IDS } from "../../app/route-types";
import {
  addProjectFromDirectory,
  listProjects,
  readManifest,
  type ManifestStatus,
} from "../../features/projects/api/projects";
import {
  createWorkspace,
  getCurrentBranch,
  listWorkspacesByProject,
  type WorkspaceRow,
} from "../../features/workspaces/api/workspaces";
import type { WorkspaceRouteLoaderData } from "../../features/workspaces/routes/workspace-route";
import { Sidebar } from "./sidebar";
import { TitleBar } from "./title-bar";

export interface DashboardLoaderData {
  projects: ProjectRecord[];
  manifestStates: Record<string, ManifestStatus["state"]>;
  workspacesByProjectId: Record<string, WorkspaceRow[]>;
  selectedProjectId: string | null;
}

export async function dashboardLoader({
  request,
}: LoaderFunctionArgs): Promise<DashboardLoaderData> {
  const [projects, workspacesByProjectId] = await Promise.all([
    listProjects(),
    listWorkspacesByProject(),
  ]);

  const manifestStates: Record<string, ManifestStatus["state"]> = {};
  const manifestStatuses = await Promise.all(
    projects.map(async (project) => ({ id: project.id, status: await readManifest(project.path) })),
  );
  for (const item of manifestStatuses) {
    manifestStates[item.id] = item.status.state;
  }

  const url = new URL(request.url);
  const selectedFromQuery = url.searchParams.get("project");
  const selectedProjectId =
    selectedFromQuery && projects.some((project) => project.id === selectedFromQuery)
      ? selectedFromQuery
      : null;

  return {
    projects,
    manifestStates,
    workspacesByProjectId,
    selectedProjectId,
  };
}

export function DashboardLayout() {
  const data = useLoaderData() as DashboardLoaderData;
  const matches = useMatches();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const workspaceMatch = matches.find((match) => match.id === ROUTE_IDS.workspace);
  const activeWorkspace = (workspaceMatch?.data as WorkspaceRouteLoaderData | undefined)?.workspace;

  const selectedWorkspaceId = activeWorkspace?.id ?? null;
  const selectedProjectId = activeWorkspace?.project_id ?? data.selectedProjectId;

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      void navigate(`/workspaces/${workspaceId}`);
    },
    [navigate],
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      const workspaces = data.workspacesByProjectId[projectId] ?? [];
      const firstWorkspace = workspaces[0];
      if (firstWorkspace) {
        void navigate(`/workspaces/${firstWorkspace.id}`);
        return;
      }

      void navigate(`/?project=${projectId}`);
    },
    [data.workspacesByProjectId, navigate],
  );

  const handleAddProject = useCallback(async () => {
    try {
      const project = await addProjectFromDirectory();
      if (!project) return;
      await revalidator.revalidate();
      void navigate(`/?project=${project.id}`);
    } catch (err) {
      console.error("Failed to add project:", err);
      alert(`Failed to add project: ${err}`);
    }
  }, [navigate, revalidator]);

  const handleCreateWorkspace = useCallback(
    async (projectId: string) => {
      const project = data.projects.find((item) => item.id === projectId);
      if (!project) return;

      try {
        const branch = await getCurrentBranch(project.path);
        const workspaceId = await createWorkspace(project.id, branch, project.path);
        void navigate(`/workspaces/${workspaceId}`);
        await revalidator.revalidate();
      } catch (err) {
        console.error("Failed to create workspace:", err);
        alert(`Failed to create workspace: ${err}`);
      }
    },
    [data.projects, navigate, revalidator],
  );

  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          projects={data.projects}
          manifestStates={data.manifestStates}
          workspacesByProjectId={data.workspacesByProjectId}
          selectedProjectId={selectedProjectId}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectProject={handleSelectProject}
          onSelectWorkspace={handleSelectWorkspace}
          onAddProject={handleAddProject}
          onCreateWorkspace={handleCreateWorkspace}
        />
        <main className="flex min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
