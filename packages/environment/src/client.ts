import type {
  LifecycleConfig,
  ServiceRecord,
  WorkspaceHost,
  WorkspaceRecord,
} from "@lifecycle/contracts";

export interface StartEnvironmentInput {
  environmentId: string;
  hostLabel: string;
  name: string;
  prepared: boolean;
  readyServiceNames: string[];
  rootPath: string;
  services: ServiceRecord[];
  serviceNames?: string[];
  sourceRef: string;
}

export interface StartEnvironmentResult {
  preparedAt: string | null;
}

export interface EnvironmentClient {
  start(config: LifecycleConfig, input: StartEnvironmentInput): Promise<StartEnvironmentResult>;

  stop(environmentId: string, names: string[]): Promise<void>;
}

export interface EnvironmentClientRegistry {
  resolve(host: WorkspaceHost): EnvironmentClient;
}

export interface EnvironmentClientRegistryClients {
  cloud?: EnvironmentClient;
  docker?: EnvironmentClient;
  local: EnvironmentClient;
  remote?: EnvironmentClient;
}

export function createStartEnvironmentInput(input: {
  hostLabel: string;
  serviceNames?: string[];
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}): StartEnvironmentInput {
  if (!input.workspace.worktree_path) {
    throw new Error(`Workspace "${input.workspace.id}" has no worktree path.`);
  }

  return {
    environmentId: input.workspace.id,
    hostLabel: input.hostLabel,
    name: input.workspace.name,
    prepared: input.workspace.prepared_at !== null,
    readyServiceNames: input.services
      .filter((service) => service.status === "ready")
      .map((service) => service.name),
    rootPath: input.workspace.worktree_path,
    services: input.services,
    sourceRef: input.workspace.source_ref,
    ...(input.serviceNames ? { serviceNames: input.serviceNames } : {}),
  };
}

export function createEnvironmentClientRegistry(
  clients: EnvironmentClientRegistryClients,
): EnvironmentClientRegistry {
  const byHost: Partial<Record<WorkspaceHost, EnvironmentClient>> = {
    local: clients.local,
    ...(clients.docker ? { docker: clients.docker } : {}),
    ...(clients.cloud ? { cloud: clients.cloud } : {}),
    ...(clients.remote ? { remote: clients.remote } : {}),
  };

  return {
    resolve(host: WorkspaceHost): EnvironmentClient {
      const client = byHost[host];
      if (!client) {
        throw new Error(`No EnvironmentClient is registered for host "${host}".`);
      }
      return client;
    },
  };
}
