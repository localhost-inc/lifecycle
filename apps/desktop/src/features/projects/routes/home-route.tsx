import { Navigate, useOutletContext } from "react-router-dom";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { readLastProjectId } from "../state/project-content-tabs";
import { readLastWorkspaceId } from "../../workspaces/state/workspace-canvas-state";
import type { AppShellOutletContext } from "../../../components/layout/app-shell-context";

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

export function resolveHomeRouteTarget(
  projects: ProjectRecord[],
  workspacesByProjectId: Record<string, WorkspaceRecord[]>,
  lastWorkspaceId: string | null,
  lastProjectId: string | null,
): string | null {
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
  );

  if (nextTarget) {
    return <Navigate replace to={nextTarget} />;
  }

  return null;
}
