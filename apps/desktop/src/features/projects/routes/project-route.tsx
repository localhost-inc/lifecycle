import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { Button, EmptyState } from "@lifecycle/ui";
import { PanelRight } from "lucide-react";
import { useMemo } from "react";
import { Outlet, useOutletContext, useParams } from "react-router-dom";
import type { AppShellOutletContext } from "../../../components/layout/app-shell-context";
import { useTerminalResponseReady } from "../../terminals/state/terminal-response-ready-provider";
import { WorkspaceActions } from "../../workspaces/components/workspace-actions";
import { workspaceSupportsFilesystemInteraction } from "../../workspaces/lib/workspace-capabilities";
import { ProjectNavBar } from "../components/project-nav-bar";
import { resolveProjectRepoWorkspace } from "../lib/project-repo-workspace";

export interface ProjectRouteOutletContext {
  onCreateWorkspace: () => Promise<void>;
  onDestroyWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onForkWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onRemoveProject: () => Promise<void>;
  project: ProjectRecord;
  repositoryWorkspace: WorkspaceRecord | null;
  workspaces: WorkspaceRecord[];
}

export function ProjectRoute() {
  const {
    onCreateWorkspace,
    onDestroyWorkspace,
    onForkWorkspace,
    onOpenWorkspace,
    onToggleSidebar,
    projects,
    sidebarCollapsed,
    workspacesByProjectId,
    onRemoveProject,
  } = useOutletContext<AppShellOutletContext>();
  const { projectId, workspaceId } = useParams();
  const project = projects.find((item) => item.id === projectId) ?? null;
  const { hasWorkspaceResponseReady, hasWorkspaceRunningTurn } = useTerminalResponseReady();
  const workspaces = useMemo(() => {
    if (!projectId) {
      return [];
    }

    return workspacesByProjectId[projectId] ?? [];
  }, [projectId, workspacesByProjectId]);
  const repositoryWorkspace = useMemo(() => resolveProjectRepoWorkspace(workspaces), [workspaces]);
  const activeWorkspace = useMemo(
    () => (workspaceId ? (workspaces.find((ws) => ws.id === workspaceId) ?? null) : null),
    [workspaceId, workspaces],
  );

  const projectRouteContext = useMemo<ProjectRouteOutletContext | null>(() => {
    if (!project) {
      return null;
    }

    return {
      onCreateWorkspace: () => onCreateWorkspace(project.id),
      onDestroyWorkspace,
      onForkWorkspace,
      onOpenWorkspace,
      onRemoveProject: () => onRemoveProject(project.id),
      project,
      repositoryWorkspace,
      workspaces,
    };
  }, [
    onCreateWorkspace,
    onDestroyWorkspace,
    onForkWorkspace,
    onOpenWorkspace,
    onRemoveProject,
    project,
    repositoryWorkspace,
    workspaces,
  ]);

  if (!project || !projectRouteContext) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-8">
        <EmptyState
          description="Choose a project from the sidebar to open the project shell."
          title="Project not found"
        />
      </div>
    );
  }

  const actionsOutlet = activeWorkspace ? (
    <div className="flex items-center gap-1">
      <WorkspaceActions
        onFork={() => void onForkWorkspace(activeWorkspace)}
        workspace={activeWorkspace}
      />
      <Button
        onClick={() => window.dispatchEvent(new Event("lifecycle:toggle-extension-panel"))}
        size="icon"
        title="Toggle extension panel"
      >
        <PanelRight size={14} strokeWidth={2.2} />
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-slot="project-shell">
      <ProjectNavBar
        actionsOutlet={actionsOutlet}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        hasWorkspaceResponseReady={hasWorkspaceResponseReady}
        hasWorkspaceRunningTurn={hasWorkspaceRunningTurn}
        onCreateWorkspace={() => void onCreateWorkspace(project.id)}
        onToggleSidebar={onToggleSidebar}
        projectId={project.id}
        sidebarCollapsed={sidebarCollapsed}
        workspaces={workspaces}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <Outlet context={projectRouteContext} />
      </div>
    </div>
  );
}
