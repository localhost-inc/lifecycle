import { isTauri } from "@tauri-apps/api/core";
import { getBackend } from "@/lib/backend";

export async function getCurrentBranch(projectPath: string): Promise<string> {
  if (!isTauri()) {
    return "main";
  }

  return getBackend().getCurrentBranch(projectPath);
}
