import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useCallback, useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AppShellOutletContext } from "@/components/layout/app-shell-context";
import type { WorkspaceCreateMode } from "@/features/workspaces/api";
import { resolveProjectRepoWorkspace } from "@/features/projects/lib/project-repo-workspace";
import {
  resolvePersistedProjectSubPath,
  writeLastProjectSubPath,
} from "@/features/projects/state/project-content-tabs";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";

export interface ProjectRouteOutletContext {
  onCreateWorkspace: (mode: WorkspaceCreateMode) => Promise<void>;
  onArchiveWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onRemoveProject: () => Promise<void>;
  project: ProjectRecord;
  repositoryWorkspace: WorkspaceRecord | null;
  workspaces: WorkspaceRecord[];
}

export function ProjectRoute() {
  const {
    onCreateWorkspace,
    onArchiveWorkspace,
    onOpenWorkspace,
    projects,
    workspacesByProjectId,
    onRemoveProject,
  } = useOutletContext<AppShellOutletContext>();
  const { projectId, workspaceId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const project = projects.find((item) => item.id === projectId) ?? null;
  const workspaces = useMemo(() => {
    if (!projectId) {
      return [];
    }

    return workspacesByProjectId[projectId] ?? [];
  }, [projectId, workspacesByProjectId]);
  const repositoryWorkspace = useMemo(() => resolveProjectRepoWorkspace(workspaces), [workspaces]);

  // Workspace prev/next shortcuts
  useShortcutRegistration({
    handler: useCallback(() => {
      if (!workspaceId || workspaces.length <= 1) {
        return true;
      }
      const currentIndex = workspaces.findIndex((ws) => ws.id === workspaceId);
      const prevIndex = (currentIndex - 1 + workspaces.length) % workspaces.length;
      const target = workspaces[prevIndex];
      if (target) {
        void navigate(`/projects/${projectId}/workspaces/${target.id}`);
      }
      return true;
    }, [workspaceId, navigate, projectId, workspaces]),
    id: "workspace.previous-workspace",
    priority: SHORTCUT_HANDLER_PRIORITY.project,
  });

  useShortcutRegistration({
    handler: useCallback(() => {
      if (!workspaceId || workspaces.length <= 1) {
        return true;
      }
      const currentIndex = workspaces.findIndex((ws) => ws.id === workspaceId);
      const nextIndex = (currentIndex + 1) % workspaces.length;
      const target = workspaces[nextIndex];
      if (target) {
        void navigate(`/projects/${projectId}/workspaces/${target.id}`);
      }
      return true;
    }, [workspaceId, navigate, projectId, workspaces]),
    id: "workspace.next-workspace",
    priority: SHORTCUT_HANDLER_PRIORITY.project,
  });

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
      onCreateWorkspace: (mode) => onCreateWorkspace(project.id, mode),
      onArchiveWorkspace,
      onOpenWorkspace,
      onRemoveProject: () => onRemoveProject(project.id),
      project,
      repositoryWorkspace,
      workspaces,
    };
  }, [
    onCreateWorkspace,
    onArchiveWorkspace,
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

  return <Outlet context={projectRouteContext} />;
}
