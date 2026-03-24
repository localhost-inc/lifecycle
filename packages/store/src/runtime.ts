import type { WorkspaceRuntime } from "@lifecycle/workspace";

/**
 * Runtime registry that the Store uses to resolve workspace-scoped operations.
 * Currently supports a single host runtime; when cloud mode arrives,
 * the Store will look up the workspace target from the collection and
 * select the appropriate runtime provider.
 */
export interface RuntimeRegistry {
  /** Returns the runtime for the given workspace target. */
  resolve(target: string): WorkspaceRuntime;
}

/**
 * Simple registry that returns the same host runtime for all targets.
 * Replace with a multi-provider registry when cloud workspaces arrive.
 */
export function createLocalOnlyRegistry(localRuntime: WorkspaceRuntime): RuntimeRegistry {
  return {
    resolve(_target: string): WorkspaceRuntime {
      return localRuntime;
    },
  };
}
