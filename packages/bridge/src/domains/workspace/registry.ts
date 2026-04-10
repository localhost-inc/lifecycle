import type { WorkspaceHost } from "@lifecycle/contracts";
import type { WorkspaceHostAdapter } from "./host";

export interface WorkspaceHostRegistry {
  resolve(host: WorkspaceHost): WorkspaceHostAdapter;
}

export interface WorkspaceHostRegistryAdapters {
  cloud?: WorkspaceHostAdapter;
  docker?: WorkspaceHostAdapter;
  local: WorkspaceHostAdapter;
  remote?: WorkspaceHostAdapter;
}

export function createWorkspaceHostRegistry(
  clients: WorkspaceHostRegistryAdapters,
): WorkspaceHostRegistry {
  const byHost: Partial<Record<WorkspaceHost, WorkspaceHostAdapter>> = {
    local: clients.local,
    ...(clients.docker ? { docker: clients.docker } : {}),
    ...(clients.cloud ? { cloud: clients.cloud } : {}),
    ...(clients.remote ? { remote: clients.remote } : {}),
  };

  return {
    resolve(host: WorkspaceHost): WorkspaceHostAdapter {
      const client = byHost[host];
      if (!client) {
        throw new Error(`No WorkspaceHostAdapter is registered for workspace host "${host}".`);
      }
      return client;
    },
  };
}
