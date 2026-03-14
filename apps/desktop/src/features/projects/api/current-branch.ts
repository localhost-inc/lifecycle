import { isTauri } from "@tauri-apps/api/core";
import { invokeTauri } from "../../../lib/tauri-error";

export async function getCurrentBranch(projectPath: string): Promise<string> {
  if (!isTauri()) {
    return "main";
  }

  return invokeTauri<string>("get_current_branch", { projectPath });
}
