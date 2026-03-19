import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useOutletContext, useParams } from "react-router-dom";
import type { AppShellOutletContext } from "../../../components/layout/app-shell-context";
import { useTerminalResponseReady } from "../../terminals/state/terminal-response-ready-provider";
import { useWorkspaceToolbarSlot } from "../../workspaces/state/workspace-toolbar-context";
import { WorkspaceNavToolbar } from "../../workspaces/components/workspace-nav-toolbar";
import { ProjectNavBar } from "../components/project-nav-bar";
import { resolveProjectRepoWorkspace } from "../lib/project-repo-workspace";
import {
  resolvePersistedProjectSubPath,
  writeLastProjectSubPath,
} from "../state/project-content-tabs";

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
    onOpenSettings,
    onOpenWorkspace,
    onToggleSidebar,
    projects,
    sidebarCollapsed,
    workspacesByProjectId,
    onRemoveProject,
  } = useOutletContext<AppShellOutletContext>();
  const { projectId, workspaceId } = useParams();
  const location = useLocation();
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
  const toolbarSlot = useWorkspaceToolbarSlot(activeWorkspace?.id ?? null);

  // Persist the current sub-path so sidebar links restore the last view
  useEffect(() => {
    if (!projectId) {
      return;
    }

    const subPath = resolvePersistedProjectSubPath({
      pathname: location.pathname,
      projectId,
      repositoryWorkspaceId: repositoryWorkspace?.id ?? null,
    });

    if (subPath) {
      writeLastProjectSubPath(projectId, subPath);
    }
  }, [location.pathname, projectId, repositoryWorkspace?.id]);

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

  const actionsOutlet = toolbarSlot ? <WorkspaceNavToolbar slot={toolbarSlot} /> : null;

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col bg-[var(--background)]"
      data-slot="project-shell"
    >
      <ProjectNavBar
        actionsOutlet={actionsOutlet}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        hasWorkspaceResponseReady={hasWorkspaceResponseReady}
        hasWorkspaceRunningTurn={hasWorkspaceRunningTurn}
        onCreateWorkspace={() => void onCreateWorkspace(project.id)}
        onDestroyWorkspace={onDestroyWorkspace}
        onForkWorkspace={onForkWorkspace}
        onOpenSettings={onOpenSettings}
        onToggleSidebar={onToggleSidebar}
        projectId={project.id}
        sidebarCollapsed={sidebarCollapsed}
        workspaces={workspaces}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-tl-lg border-l border-t border-[var(--border)] bg-[var(--surface)]">
        <Outlet context={projectRouteContext} />
      </div>
    </div>
  );
}
