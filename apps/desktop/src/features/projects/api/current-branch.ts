import { isTauri } from "@tauri-apps/api/core";
import type { WorkspaceRuntime } from "@lifecycle/workspace";

export async function getCurrentBranch(
  runtime: WorkspaceRuntime,
  projectPath: string,
): Promise<string> {
  if (!isTauri()) {
    return "main";
  }

  return runtime.getCurrentBranch(projectPath);
}
