import type { WorkspaceServiceRecord } from "@lifecycle/contracts";
import type {
  WorkspaceProvider,
  WorkspaceProviderCreateInput,
  WorkspaceProviderCreateResult,
  WorkspaceProviderHealthResult,
  WorkspaceProviderStartInput,
} from "../../provider";

export interface CloudWorkspaceClient {
  createWorkspace(input: WorkspaceProviderCreateInput): Promise<WorkspaceProviderCreateResult>;
  startServices(input: WorkspaceProviderStartInput): Promise<WorkspaceServiceRecord[]>;
  healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult>;
  stopServices(workspaceId: string, serviceNames?: string[]): Promise<void>;
  runSetup(workspaceId: string): Promise<void>;
  sleep(workspaceId: string): Promise<void>;
  wake(workspaceId: string): Promise<void>;
  destroy(workspaceId: string): Promise<void>;
  openTerminal(workspaceId: string, cols: number, rows: number): Promise<{ terminalId: string }>;
  exposePort(workspaceId: string, serviceName: string, port: number): Promise<string | null>;
}

export class CloudWorkspaceProvider implements WorkspaceProvider {
  private client: CloudWorkspaceClient;

  constructor(client: CloudWorkspaceClient) {
    this.client = client;
  }

  createWorkspace(input: WorkspaceProviderCreateInput): Promise<WorkspaceProviderCreateResult> {
    return this.client.createWorkspace(input);
  }

  startServices(input: WorkspaceProviderStartInput): Promise<WorkspaceServiceRecord[]> {
    return this.client.startServices(input);
  }

  healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult> {
    return this.client.healthCheck(workspaceId);
  }

  stopServices(workspaceId: string, serviceNames?: string[]): Promise<void> {
    return this.client.stopServices(workspaceId, serviceNames);
  }

  runSetup(workspaceId: string): Promise<void> {
    return this.client.runSetup(workspaceId);
  }

  sleep(workspaceId: string): Promise<void> {
    return this.client.sleep(workspaceId);
  }

  wake(workspaceId: string): Promise<void> {
    return this.client.wake(workspaceId);
  }

  destroy(workspaceId: string): Promise<void> {
    return this.client.destroy(workspaceId);
  }

  openTerminal(workspaceId: string, cols: number, rows: number): Promise<{ terminalId: string }> {
    return this.client.openTerminal(workspaceId, cols, rows);
  }

  exposePort(workspaceId: string, serviceName: string, port: number): Promise<string | null> {
    return this.client.exposePort(workspaceId, serviceName, port);
  }
}
