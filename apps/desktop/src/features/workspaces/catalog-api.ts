import { isTauri } from "@tauri-apps/api/core";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { getControlPlane } from "@/lib/control-plane";

export async function getProjectWorkspace(projectId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    void projectId;
    return null;
  }

  return getControlPlane().getProjectWorkspace(projectId);
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  if (!isTauri()) {
    return [];
  }

  return getControlPlane().listWorkspaces();
}

export async function listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>> {
  if (!isTauri()) {
    return {};
  }

  return getControlPlane().listWorkspacesByProject();
}
