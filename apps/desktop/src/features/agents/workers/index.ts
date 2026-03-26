import type {
  AgentWorker,
  AgentWorkerEvent,
  AgentWorkerSnapshot,
  AgentSessionContext,
} from "@lifecycle/agents";
import type { AgentSessionRecord, WorkspaceHost } from "@lifecycle/contracts";
import { createLocalWorker } from "./local";

export interface CreateWorkerOptions {
  session: AgentSessionRecord;
  context: AgentSessionContext;
  onState: (snapshot: AgentWorkerSnapshot) => void | Promise<void>;
  onWorkerEvent: (event: AgentWorkerEvent) => void | Promise<void>;
}

export interface CreateWorkerResult {
  session: AgentSessionRecord;
  worker: AgentWorker;
}

export type AgentWorkerFactory = (options: CreateWorkerOptions) => Promise<CreateWorkerResult>;

export interface AgentWorkerProviderRegistry {
  resolve(workspaceHost: WorkspaceHost): AgentWorkerFactory;
}

export interface AgentWorkerProviderRegistryInput {
  cloud?: AgentWorkerFactory;
  docker?: AgentWorkerFactory;
  local: AgentWorkerFactory;
  remote?: AgentWorkerFactory;
}

export function createAgentWorkerProviderRegistry(
  providers: AgentWorkerProviderRegistryInput,
): AgentWorkerProviderRegistry {
  const byHost: Partial<Record<WorkspaceHost, AgentWorkerFactory>> = {
    // Docker workspaces currently reuse the desktop-host agent worker path.
    docker: providers.docker ?? providers.local,
    local: providers.local,
    ...(providers.cloud ? { cloud: providers.cloud } : {}),
    ...(providers.remote ? { remote: providers.remote } : {}),
  };

  return {
    resolve(workspaceHost: WorkspaceHost): AgentWorkerFactory {
      const provider = byHost[workspaceHost];
      if (!provider) {
        throw new Error(
          `No AgentWorker provider is registered for workspace host "${workspaceHost}".`,
        );
      }
      return provider;
    },
  };
}

export function createDesktopAgentWorkerProviderRegistry(): AgentWorkerProviderRegistry {
  return createAgentWorkerProviderRegistry({
    local: createLocalWorker,
  });
}
