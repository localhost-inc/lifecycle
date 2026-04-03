import type {
  LifecycleConfig,
  ServiceRecord,
  WorkspaceHost,
  WorkspaceRecord,
} from "@lifecycle/contracts";

export interface StartStackCallbacks {
  onServiceFailed?: (name: string) => void;
  onServiceReady?: (service: StartedService) => void;
  onServiceStarting?: (name: string) => void;
}

export interface StartStackInput {
  callbacks?: StartStackCallbacks;
  stackId: string;
  hostLabel: string;
  name: string;
  prepared: boolean;
  readyServiceNames: string[];
  rootPath: string;
  services: ServiceRecord[];
  serviceNames?: string[];
  sourceRef: string;
}

export interface StartedService {
  assignedPort: number | null;
  name: string;
}

export interface StartStackResult {
  preparedAt: string | null;
  startedServices: StartedService[];
}

export interface StackClient {
  start(config: LifecycleConfig, input: StartStackInput): Promise<StartStackResult>;

  stop(stackId: string, names: string[], hostLabel?: string): Promise<void>;
}

export interface StackClientRegistry {
  resolve(host: WorkspaceHost): StackClient;
}

export interface StackClientRegistryClients {
  cloud?: StackClient;
  docker?: StackClient;
  local: StackClient;
  remote?: StackClient;
}

export function createStartStackInput(input: {
  hostLabel: string;
  serviceNames?: string[];
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
}): StartStackInput {
  if (!input.workspace.worktree_path) {
    throw new Error(`Workspace "${input.workspace.id}" has no worktree path.`);
  }

  return {
    stackId: input.workspace.id,
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

export function createStackClientRegistry(
  clients: StackClientRegistryClients,
): StackClientRegistry {
  const byHost: Partial<Record<WorkspaceHost, StackClient>> = {
    local: clients.local,
    ...(clients.docker ? { docker: clients.docker } : {}),
    ...(clients.cloud ? { cloud: clients.cloud } : {}),
    ...(clients.remote ? { remote: clients.remote } : {}),
  };

  return {
    resolve(host: WorkspaceHost): StackClient {
      const client = byHost[host];
      if (!client) {
        throw new Error(`No StackClient is registered for host "${host}".`);
      }
      return client;
    },
  };
}
