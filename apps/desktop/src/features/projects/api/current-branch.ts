import { isTauri } from "@tauri-apps/api/core";
import type { WorkspaceClient } from "@lifecycle/workspace";

export async function getCurrentBranch(
  client: WorkspaceClient,
  projectPath: string,
): Promise<string> {
  if (!isTauri()) {
    return "main";
  }

  return client.getCurrentBranch(projectPath);
}
