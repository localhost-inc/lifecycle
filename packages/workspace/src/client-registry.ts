import type { WorkspaceHost } from "@lifecycle/contracts";
import type { WorkspaceClient } from "./workspace";

export interface WorkspaceClientRegistry {
  resolve(host: WorkspaceHost): WorkspaceClient;
}

export interface WorkspaceClientRegistryClients {
  cloud?: WorkspaceClient;
  docker?: WorkspaceClient;
  local: WorkspaceClient;
  remote?: WorkspaceClient;
}

export function createWorkspaceClientRegistry(
  clients: WorkspaceClientRegistryClients,
): WorkspaceClientRegistry {
  const byHost: Partial<Record<WorkspaceHost, WorkspaceClient>> = {
    local: clients.local,
    ...(clients.docker ? { docker: clients.docker } : {}),
    ...(clients.cloud ? { cloud: clients.cloud } : {}),
    ...(clients.remote ? { remote: clients.remote } : {}),
  };

  return {
    resolve(host: WorkspaceHost): WorkspaceClient {
      const client = byHost[host];
      if (!client) {
        throw new Error(`No WorkspaceClient is registered for workspace host "${host}".`);
      }
      return client;
    },
  };
}
