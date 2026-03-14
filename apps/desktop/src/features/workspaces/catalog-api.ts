import { isTauri } from "@tauri-apps/api/core";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { invokeTauri } from "../../lib/tauri-error";

export async function getProjectWorkspace(projectId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    void projectId;
    return null;
  }

  return invokeTauri<WorkspaceRecord | null>("get_workspace", { projectId });
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  if (!isTauri()) {
    return [];
  }

  return invokeTauri<WorkspaceRecord[]>("list_workspaces");
}

export async function listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>> {
  if (!isTauri()) {
    return {};
  }

  return invokeTauri<Record<string, WorkspaceRecord[]>>("list_workspaces_by_project");
}
