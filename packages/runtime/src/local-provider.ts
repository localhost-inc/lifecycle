import type { WorkspaceServiceRecord } from "@lifecycle/contracts";
import type {
  WorkspaceProvider,
  WorkspaceProviderCreateInput,
  WorkspaceProviderCreateResult,
  WorkspaceProviderHealthResult,
  WorkspaceProviderStartInput,
} from "./provider";

interface TauriInvoke {
  (cmd: string, args?: Record<string, unknown>): Promise<unknown>;
}

export class LocalWorkspaceProvider implements WorkspaceProvider {
  private invoke: TauriInvoke;

  constructor(invoke: TauriInvoke) {
    this.invoke = invoke;
  }

  async createWorkspace(
    input: WorkspaceProviderCreateInput & {
      projectId: string;
      projectPath: string;
    },
  ): Promise<WorkspaceProviderCreateResult> {
    const workspaceId = (await this.invoke("create_workspace", {
      projectId: input.projectId,
      sourceRef: input.sourceRef,
      projectPath: input.projectPath,
    })) as string;

    return {
      workspace: {
        id: workspaceId,
        projectId: input.projectId,
        mode: "local",
        sourceRef: input.sourceRef,
        status: "creating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      worktreePath: "",
    };
  }

  async startServices(input: WorkspaceProviderStartInput): Promise<WorkspaceServiceRecord[]> {
    await this.invoke("start_services", {
      workspaceId: input.workspace.id,
      manifestJson: input.manifestJson,
    });
    return input.services;
  }

  async healthCheck(workspaceId: string): Promise<WorkspaceProviderHealthResult> {
    const services = (await this.invoke("get_workspace_services", {
      workspaceId,
    })) as WorkspaceServiceRecord[];
    const healthy = services.every((s) => s.status === "ready");
    return { healthy, services };
  }

  async stopServices(workspaceId: string): Promise<void> {
    await this.invoke("stop_workspace", { workspaceId });
  }

  async runSetup(_workspaceId: string): Promise<void> {
    // Setup runs as part of start_services
  }

  async sleep(workspaceId: string): Promise<void> {
    await this.invoke("stop_workspace", { workspaceId });
  }

  async wake(_workspaceId: string): Promise<void> {
    // TODO: M6 — restart services from sleeping state
  }

  async destroy(_workspaceId: string): Promise<void> {
    // TODO: M6 — stop + remove worktree + delete records
  }

  async openTerminal(
    _workspaceId: string,
    _cols: number,
    _rows: number,
  ): Promise<{ terminalId: string }> {
    // TODO: M3
    throw new Error("Not implemented");
  }

  async exposePort(
    _workspaceId: string,
    _serviceName: string,
    _port: number,
  ): Promise<string | null> {
    // TODO: M5
    return null;
  }
}
