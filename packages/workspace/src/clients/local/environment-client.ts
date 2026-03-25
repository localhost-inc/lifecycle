import {
  EnvironmentOrchestrator,
  type PrepareStartInput,
  type PrepareStartResult,
  type StepInput,
} from "../../environment/orchestrator";

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

export class LocalEnvironmentOrchestrator extends EnvironmentOrchestrator {
  private invoke: InvokeFn;

  /** Set before calling start() so startService can forward it to Rust. */
  activeManifestJson = "";

  constructor(invoke: InvokeFn) {
    super();
    this.invoke = invoke;
  }

  async prepareStart(input: PrepareStartInput): Promise<PrepareStartResult> {
    return (await this.invoke("prepare_environment_start", {
      input: {
        workspaceId: input.workspaceId,
        manifestJson: input.manifestJson,
        manifestFingerprint: input.manifestFingerprint,
        serviceNames: input.serviceNames,
      },
    })) as PrepareStartResult;
  }

  async runStep(workspaceId: string, step: StepInput): Promise<void> {
    await this.invoke("run_environment_step", {
      input: {
        workspaceId,
        name: step.name,
        command: step.command ?? null,
        writeFiles: step.writeFiles ?? null,
        timeoutSeconds: step.timeoutSeconds,
        cwd: step.cwd ?? null,
        env: step.env ?? null,
      },
    });
  }

  async startService(workspaceId: string, serviceName: string): Promise<void> {
    await this.invoke("start_environment_service", {
      workspaceId,
      serviceName,
      manifestJson: this.activeManifestJson,
    });
  }

  async stopService(workspaceId: string, serviceName: string): Promise<void> {
    await this.invoke("stop_environment_service", {
      workspaceId,
      serviceName,
    });
  }

  async stopAll(workspaceId: string): Promise<void> {
    await this.invoke("stop_workspace_services", { workspaceId });
  }

  async markPrepared(workspaceId: string): Promise<void> {
    await this.invoke("mark_workspace_prepared", { workspaceId });
  }

  async getReadyServices(workspaceId: string): Promise<Set<string>> {
    const names = (await this.invoke("get_workspace_ready_services", {
      workspaceId,
    })) as string[];
    return new Set(names);
  }

  async isPrepared(workspaceId: string): Promise<boolean> {
    return (await this.invoke("get_workspace_prepared", {
      workspaceId,
    })) as boolean;
  }
}
