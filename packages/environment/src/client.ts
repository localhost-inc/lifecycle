import type { LifecycleConfig, ServiceRecord } from "@lifecycle/contracts";

export interface StartEnvironmentInput {
  environmentId: string;
  hostLabel: string;
  logDir: string;
  manifestJson: string;
  manifestFingerprint: string;
  name: string;
  prepared: boolean;
  previewProxyPort: number;
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
  start(
    config: LifecycleConfig,
    input: StartEnvironmentInput,
  ): Promise<StartEnvironmentResult>;

  stop(environmentId: string, names: string[]): Promise<void>;
}

export interface EnvironmentClientRegistry {
  resolve(host: string): EnvironmentClient;
}

export interface EnvironmentClientRegistryClients {
  [host: string]: EnvironmentClient;
}

export function createEnvironmentClientRegistry(
  clients: EnvironmentClientRegistryClients,
): EnvironmentClientRegistry {
  return {
    resolve(host: string): EnvironmentClient {
      const client = clients[host];
      if (!client) {
        throw new Error(`No EnvironmentClient is registered for host "${host}".`);
      }
      return client;
    },
  };
}
