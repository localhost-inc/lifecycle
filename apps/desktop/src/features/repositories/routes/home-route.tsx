import { Navigate, useOutletContext } from "react-router-dom";
import type { RepositoryRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { readLastRepositoryId } from "@/features/repositories/state/repository-content-tabs";
import { readLastWorkspaceId } from "@/features/workspaces/state/workspace-canvas-state";
import type { AppShellOutletContext } from "@/components/layout/app-shell-context";

function safeReadLastRepositoryId(): string | null {
  try {
    return readLastRepositoryId();
  } catch {
    return null;
  }
}

function safeReadLastWorkspaceId(): string | null {
  try {
    return readLastWorkspaceId();
  } catch {
    return null;
  }
}

function safeReadLastPath(): string | null {
  try {
    return localStorage.getItem("lifecycle.desktop.last-path");
  } catch {
    return null;
  }
}

export function resolveHomeRouteTarget(
  repositories: RepositoryRecord[],
  workspacesByRepositoryId: Record<string, WorkspaceRecord[]>,
  lastWorkspaceId: string | null,
  lastRepositoryId: string | null,
  lastPath: string | null,
): string | null {
  // Prefer the stored full path when it still points to a valid repository.
  if (lastPath && lastPath !== "/") {
    const repositoryIdMatch = lastPath.match(/^\/repositories\/([^/]+)/);
    if (repositoryIdMatch) {
      const pathRepositoryId = repositoryIdMatch[1];
      if (repositories.some((repository) => repository.id === pathRepositoryId)) {
        return lastPath;
      }
    }
  }

  const lastRepository =
    lastRepositoryId !== null
      ? (repositories.find((repository) => repository.id === lastRepositoryId) ?? null)
      : null;
  if (lastRepository) {
    return `/repositories/${lastRepository.id}`;
  }

  const allWorkspaces = Object.values(workspacesByRepositoryId).flat();
  const lastWorkspace =
    lastWorkspaceId !== null
      ? (allWorkspaces.find((workspace) => workspace.id === lastWorkspaceId) ?? null)
      : null;

  if (lastWorkspace) {
    return `/repositories/${lastWorkspace.repository_id}/workspaces/${lastWorkspace.id}`;
  }

  const firstRepository = repositories[0];
  if (firstRepository) {
    return `/repositories/${firstRepository.id}`;
  }

  return null;
}

export function HomeRoute() {
  const { repositories, workspacesByRepositoryId } = useOutletContext<AppShellOutletContext>();
  const nextTarget = resolveHomeRouteTarget(
    repositories,
    workspacesByRepositoryId,
    safeReadLastWorkspaceId(),
    safeReadLastRepositoryId(),
    safeReadLastPath(),
  );

  if (nextTarget) {
    return <Navigate replace to={nextTarget} />;
  }

  return null;
}
