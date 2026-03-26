import type { WorkspaceHost } from "@lifecycle/contracts";
import type { WorkspaceHostClient } from "./workspace";

export interface WorkspaceHostClientRegistry {
  resolve(host: WorkspaceHost): WorkspaceHostClient;
}

export interface WorkspaceHostClientRegistryProviders {
  cloud?: WorkspaceHostClient;
  docker?: WorkspaceHostClient;
  local: WorkspaceHostClient;
  remote?: WorkspaceHostClient;
}

/**
 * Resolve workspace-scoped operations through explicit host providers.
 * `docker` currently defaults to the local host client because mounted-local
 * workspace flows still run through the desktop host path.
 */
export function createWorkspaceHostClientRegistry(
  providers: WorkspaceHostClientRegistryProviders,
): WorkspaceHostClientRegistry {
  const byHost: Partial<Record<WorkspaceHost, WorkspaceHostClient>> = {
    docker: providers.docker ?? providers.local,
    local: providers.local,
    ...(providers.cloud ? { cloud: providers.cloud } : {}),
    ...(providers.remote ? { remote: providers.remote } : {}),
  };

  return {
    resolve(host: WorkspaceHost): WorkspaceHostClient {
      const client = byHost[host];
      if (!client) {
        throw new Error(
          `No WorkspaceHostClient provider is registered for workspace host "${host}".`,
        );
      }
      return client;
    },
  };
}
