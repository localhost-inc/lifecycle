import { isTauri } from "@tauri-apps/api/core";
import { getControlPlane } from "@/lib/control-plane";

export async function getCurrentBranch(projectPath: string): Promise<string> {
  if (!isTauri()) {
    return "main";
  }

  return getControlPlane().getCurrentBranch(projectPath);
}
