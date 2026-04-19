import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface SelectionState {
  workspace_id?: string | null;
}

export function selectionStatePath(homeDir: string = homedir()): string {
  return join(homeDir, ".lifecycle", "tui", "state.json");
}

export async function loadWorkspaceSelection(homeDir?: string): Promise<string | null> {
  try {
    const raw = await readFile(selectionStatePath(homeDir), "utf8");
    const payload = JSON.parse(raw) as SelectionState;
    const workspaceId = payload.workspace_id?.trim();
    return workspaceId ? workspaceId : null;
  } catch {
    return null;
  }
}

export async function saveWorkspaceSelection(
  workspaceId: string | null,
  homeDir?: string,
): Promise<void> {
  const path = selectionStatePath(homeDir);
  await mkdir(dirname(path), { recursive: true });
  const payload: SelectionState = {
    workspace_id: workspaceId?.trim() ? workspaceId : null,
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
