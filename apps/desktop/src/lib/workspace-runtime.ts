import type { WorkspaceRuntime } from "../../../../packages/runtime/src/workspace-runtime.ts";
import { LocalWorkspaceRuntime } from "../../../../packages/runtime/src/local-workspace-runtime.ts";
import { invokeTauri } from "@/lib/tauri-error";

let localWorkspaceRuntime: WorkspaceRuntime | null = null;

export function getWorkspaceRuntime(): WorkspaceRuntime {
  localWorkspaceRuntime ??= new LocalWorkspaceRuntime((command, args) =>
    invokeTauri(command, args),
  );
  return localWorkspaceRuntime;
}
