import type { RepositoryRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useCallback, useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AppShellOutletContext } from "@/components/layout/app-shell-context";
import type { WorkspaceCreateMode } from "@/features/workspaces/types";
import { resolveRepositoryRootWorkspace } from "@/features/repositories/lib/repository-root-workspace";
import {
  resolvePersistedRepositorySubPath,
  writeLastRepositorySubPath,
} from "@/features/repositories/state/repository-content-tabs";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";

export interface RepositoryRouteOutletContext {
  onCreateWorkspace: (mode: WorkspaceCreateMode) => Promise<void>;
  onArchiveWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  onOpenWorkspace: (workspace: WorkspaceRecord) => void;
  onRemoveRepository: () => Promise<void>;
  repository: RepositoryRecord;
  repositoryWorkspace: WorkspaceRecord | null;
  workspaces: WorkspaceRecord[];
}

export function RepositoryRoute() {
  const {
    onCreateWorkspace,
    onArchiveWorkspace,
    onOpenWorkspace,
    repositories,
    workspacesByRepositoryId,
    onRemoveRepository,
  } = useOutletContext<AppShellOutletContext>();
  const { repositoryId, workspaceId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const repository = repositories.find((item) => item.id === repositoryId) ?? null;
  const workspaces = useMemo(() => {
    if (!repositoryId) {
      return [];
    }

    return workspacesByRepositoryId[repositoryId] ?? [];
  }, [repositoryId, workspacesByRepositoryId]);
  const repositoryWorkspace = useMemo(() => resolveRepositoryRootWorkspace(workspaces), [workspaces]);

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
        void navigate(`/repositories/${repositoryId}/workspaces/${target.id}`);
      }
      return true;
    }, [workspaceId, navigate, repositoryId, workspaces]),
    id: "workspace.previous-workspace",
    priority: SHORTCUT_HANDLER_PRIORITY.repository,
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
        void navigate(`/repositories/${repositoryId}/workspaces/${target.id}`);
      }
      return true;
    }, [workspaceId, navigate, repositoryId, workspaces]),
    id: "workspace.next-workspace",
    priority: SHORTCUT_HANDLER_PRIORITY.repository,
  });

  // Persist the current sub-path so sidebar links restore the last view
  useEffect(() => {
    if (!repositoryId) {
      return;
    }

    const subPath = resolvePersistedRepositorySubPath({
      pathname: location.pathname,
      repositoryId,
      repositoryWorkspaceId: repositoryWorkspace?.id ?? null,
    });

    if (subPath) {
      writeLastRepositorySubPath(repositoryId, subPath);
    }
  }, [location.pathname, repositoryId, repositoryWorkspace?.id]);

  const repositoryRouteContext = useMemo<RepositoryRouteOutletContext | null>(() => {
    if (!repository) {
      return null;
    }

    return {
      onCreateWorkspace: (mode) => onCreateWorkspace(repository.id, mode),
      onArchiveWorkspace,
      onOpenWorkspace,
      onRemoveRepository: () => onRemoveRepository(repository.id),
      repository,
      repositoryWorkspace,
      workspaces,
    };
  }, [
    onCreateWorkspace,
    onArchiveWorkspace,
    onOpenWorkspace,
    onRemoveRepository,
    repository,
    repositoryWorkspace,
    workspaces,
  ]);

  if (!repository || !repositoryRouteContext) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-8">
        <EmptyState
          description="Choose a repository from the sidebar to open the repository shell."
          title="Repository not found"
        />
      </div>
    );
  }

  return <Outlet context={repositoryRouteContext} />;
}
