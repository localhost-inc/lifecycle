import { useCallback, useMemo } from "react";
import { Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { addProjectFromDirectory } from "../../features/projects/api/projects";
import { projectKeys, useProjectCatalog } from "../../features/projects/hooks";
import { useSettings } from "../../features/settings/state/app-settings-provider";
import {
  createTerminal,
  DEFAULT_HARNESS_PROVIDER,
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
} from "../../features/terminals/api";
import { terminalKeys } from "../../features/terminals/hooks";
import { createWorkspace, getCurrentBranch } from "../../features/workspaces/api";
import { useWorkspacesByProject, workspaceKeys } from "../../features/workspaces/hooks";
import { useStoreClient } from "../../store";
import { Sidebar } from "./sidebar";
import { AppStatusBar } from "./app-status-bar";
import { TitleBar } from "./title-bar";

export function DashboardLayout() {
  const client = useStoreClient();
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const [searchParams] = useSearchParams();
  const { worktreeRoot } = useSettings();
  const projectCatalogQuery = useProjectCatalog();
  const workspacesByProjectQuery = useWorkspacesByProject();
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
  const workspaces = useMemo(
    () => Object.values(workspacesByProjectId).flat(),
    [workspacesByProjectId],
  );
  const selectedWorkspaceId = workspaceId ?? null;
  const selectedWorkspace = useMemo(
    () =>
      selectedWorkspaceId
        ? (workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null)
        : null,
    [selectedWorkspaceId, workspaces],
  );
  const selectedProjectFromQuery = searchParams.get("project");
  const fallbackSelectedProjectId =
    selectedProjectFromQuery && projects.some((project) => project.id === selectedProjectFromQuery)
      ? selectedProjectFromQuery
      : null;
  const activeProjectId = selectedWorkspaceId ? null : fallbackSelectedProjectId;

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

        void (async () => {
          try {
            await createTerminal({
              cols: DEFAULT_TERMINAL_COLS,
              harnessProvider: DEFAULT_HARNESS_PROVIDER,
              launchType: "harness",
              rows: DEFAULT_TERMINAL_ROWS,
              workspaceId,
            });
            client.invalidate(terminalKeys.byWorkspace(workspaceId));
          } catch (terminalError) {
            console.error("Failed to create initial harness terminal:", terminalError);
            alert(
              `Workspace created, but failed to start the initial ${DEFAULT_HARNESS_PROVIDER} harness: ${terminalError}`,
            );
          }
        })();

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
      <TitleBar selectedWorkspace={selectedWorkspace} />
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
        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <AppStatusBar />
    </div>
  );
}
