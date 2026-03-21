import { isTauri } from "@tauri-apps/api/core";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { getBackend } from "@/lib/backend";

export async function getProjectWorkspace(projectId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    void projectId;
    return null;
  }

  return getBackend().getProjectWorkspace(projectId);
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  if (!isTauri()) {
    return [];
  }

  return getBackend().listWorkspaces();
}

export async function listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>> {
  if (!isTauri()) {
    return {};
  }

  return getBackend().listWorkspacesByProject();
}
