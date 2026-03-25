import { Navigate, useOutletContext } from "react-router-dom";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { readLastProjectId } from "@/features/projects/state/project-content-tabs";
import { readLastWorkspaceId } from "@/features/workspaces/state/workspace-canvas-state";
import type { AppShellOutletContext } from "@/components/layout/app-shell-context";

function safeReadLastProjectId(): string | null {
  try {
    return readLastProjectId();
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
  projects: ProjectRecord[],
  workspacesByProjectId: Record<string, WorkspaceRecord[]>,
  lastWorkspaceId: string | null,
  lastProjectId: string | null,
  lastPath: string | null,
): string | null {
  // Prefer the stored full path when it still points to a valid project
  if (lastPath && lastPath !== "/") {
    const projectIdMatch = lastPath.match(/^\/projects\/([^/]+)/);
    if (projectIdMatch) {
      const pathProjectId = projectIdMatch[1];
      if (projects.some((project) => project.id === pathProjectId)) {
        return lastPath;
      }
    }
  }

  const lastProject =
    lastProjectId !== null
      ? (projects.find((project) => project.id === lastProjectId) ?? null)
      : null;
  if (lastProject) {
    return `/projects/${lastProject.id}`;
  }

  const allWorkspaces = Object.values(workspacesByProjectId).flat();
  const lastWorkspace =
    lastWorkspaceId !== null
      ? (allWorkspaces.find((workspace) => workspace.id === lastWorkspaceId) ?? null)
      : null;

  if (lastWorkspace) {
    return `/projects/${lastWorkspace.project_id}/workspaces/${lastWorkspace.id}`;
  }

  const firstProject = projects[0];
  if (firstProject) {
    return `/projects/${firstProject.id}`;
  }

  return null;
}

export function HomeRoute() {
  const { projects, workspacesByProjectId } = useOutletContext<AppShellOutletContext>();
  const nextTarget = resolveHomeRouteTarget(
    projects,
    workspacesByProjectId,
    safeReadLastWorkspaceId(),
    safeReadLastProjectId(),
    safeReadLastPath(),
  );

  if (nextTarget) {
    return <Navigate replace to={nextTarget} />;
  }

  return null;
}
