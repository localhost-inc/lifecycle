import { isTauri } from "@tauri-apps/api/core";
import { invokeTauri } from "@/lib/tauri-error";

export type OpenInAppId =
  | "cursor"
  | "finder"
  | "ghostty"
  | "iterm"
  | "vscode"
  | "warp"
  | "windsurf"
  | "xcode"
  | "zed";

export interface WorkspaceOpenInAppInfo {
  icon_data_url: string | null;
  id: OpenInAppId;
  label: string;
}

export async function openWorkspaceInApp(workspaceId: string, appId: OpenInAppId): Promise<void> {
  if (!isTauri()) {
    console.warn("[browser] open_workspace_in_app is not supported outside Tauri");
    return;
  }

  return invokeTauri<void>("open_workspace_in_app", { workspaceId, appId });
}

export async function listWorkspaceOpenInApps(): Promise<WorkspaceOpenInAppInfo[]> {
  if (!isTauri()) {
    return [];
  }

  return invokeTauri<WorkspaceOpenInAppInfo[]>("list_workspace_open_in_apps");
}
