import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export async function chooseProjectDirectory(): Promise<string | null> {
  if (!isTauri()) {
    throw new Error("Project import requires the Tauri desktop shell.");
  }

  return open({ directory: true, multiple: false });
}

export async function cleanupProject(_rootWorkspaceIds: string[]): Promise<void> {
  // Git watchers are now managed in TS — nothing to clean up on the Rust side.
}
