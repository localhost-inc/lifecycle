import type { WorkspaceHost } from "@lifecycle/contracts";
import type { AgentClient } from "./client";

export interface AgentClientRegistry {
  resolve(host: WorkspaceHost): AgentClient;
}

export interface AgentClientRegistryClients {
  cloud?: AgentClient;
  docker?: AgentClient;
  local: AgentClient;
  remote?: AgentClient;
}

export function createAgentClientRegistry(
  clients: AgentClientRegistryClients,
): AgentClientRegistry {
  const byHost: Partial<Record<WorkspaceHost, AgentClient>> = {
    local: clients.local,
    ...(clients.docker ? { docker: clients.docker } : {}),
    ...(clients.cloud ? { cloud: clients.cloud } : {}),
    ...(clients.remote ? { remote: clients.remote } : {}),
  };

  return {
    resolve(host: WorkspaceHost): AgentClient {
      const client = byHost[host];
      if (!client) {
        throw new Error(`No AgentClient is registered for workspace host "${host}".`);
      }

      return client;
    },
  };
}
