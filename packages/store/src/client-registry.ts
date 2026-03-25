import type { WorkspaceClient } from "@lifecycle/workspace";

/**
 * Client registry that the Store uses to resolve workspace-scoped operations.
 * Currently supports a single local client; when cloud mode arrives,
 * the Store will look up the workspace target from the collection and
 * select the appropriate client provider.
 */
export interface ClientRegistry {
  /** Returns the client for the given workspace target. */
  resolve(target: string): WorkspaceClient;
}

/**
 * Simple registry that returns the same local client for all targets.
 * Replace with a multi-provider registry when cloud workspaces arrive.
 */
export function createLocalOnlyRegistry(localClient: WorkspaceClient): ClientRegistry {
  return {
    resolve(_target: string): WorkspaceClient {
      return localClient;
    },
  };
}
