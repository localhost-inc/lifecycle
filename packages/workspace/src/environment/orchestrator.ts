import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { resolveStartOrder } from "./graph";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StartEnvironmentInput {
  workspaceId: string;
  manifestJson: string;
  manifestFingerprint: string;
  prepared: boolean;
  readyServiceNames: string[];
  services: ServiceRecord[];
  serviceNames?: string[];
  workspace: WorkspaceRecord;
  worktreePath: string;
}

export interface StartEnvironmentResult {
  preparedAt: string | null;
}

export interface PrepareStartInput {
  workspaceId: string;
  manifestJson: string;
  manifestFingerprint: string;
  serviceNames: string[];
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
  worktreePath: string;
}

export interface PrepareStartResult {
  serviceNames: string[];
}

export interface StepInput {
  name: string;
  command?: string;
  writeFiles?: Array<{
    path: string;
    content?: string;
    lines?: string[];
  }>;
  timeoutSeconds: number;
  cwd?: string;
  env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// EnvironmentOrchestrator
// ---------------------------------------------------------------------------

/**
 * Walks the dependency graph and starts/stops environment services in order.
 * Subclasses implement the per-service execution for a specific runtime
 * (local processes, cloud, etc.).
 */
export abstract class EnvironmentOrchestrator {
  // -- Shared orchestration --------------------------------------------------

  async start(
    config: LifecycleConfig,
    input: StartEnvironmentInput,
  ): Promise<StartEnvironmentResult> {
    const { workspaceId } = input;

    const { prepareSteps, sorted } = resolveStartOrder(config, {
      prepared: input.prepared,
      ...(input.serviceNames ? { targetServices: input.serviceNames } : {}),
      satisfiedServices: new Set(input.readyServiceNames),
    });

    const serviceNames = sorted.filter((n) => n.kind === "service").map((n) => n.name);

    if (prepareSteps.length === 0 && serviceNames.length === 0) {
      return {
        preparedAt: null,
      };
    }

    await this.prepareStart({
      workspaceId,
      manifestJson: input.manifestJson,
      manifestFingerprint: input.manifestFingerprint,
      serviceNames,
      services: input.services,
      workspace: input.workspace,
      worktreePath: input.worktreePath,
    });

    for (const step of prepareSteps) {
      await this.runStep(workspaceId, prepareStepToInput(step));
    }

    for (const node of sorted) {
      if (node.kind === "task") {
        await this.runStep(workspaceId, taskNodeToInput(node, config));
      } else {
        await this.startService(workspaceId, node.name);
      }
    }

    return {
      preparedAt: !input.prepared && prepareSteps.length > 0 ? new Date().toISOString() : null,
    };
  }

  async stop(workspaceId: string): Promise<void> {
    await this.stopAll(workspaceId);
  }

  // -- Runtime-specific (implemented by subclass) ----------------------------

  abstract prepareStart(input: PrepareStartInput): Promise<PrepareStartResult>;
  abstract runStep(workspaceId: string, step: StepInput): Promise<void>;
  abstract startService(workspaceId: string, serviceName: string): Promise<void>;
  abstract stopService(workspaceId: string, serviceName: string): Promise<void>;
  abstract stopAll(workspaceId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prepareStepToInput(step: { name: string; runOn?: "create" | "start" }): StepInput {
  return { name: step.name, timeoutSeconds: 0 };
}

function taskNodeToInput(node: { name: string }, config: LifecycleConfig): StepInput {
  const taskConfig = config.environment[node.name];
  if (!taskConfig || taskConfig.kind !== "task") {
    return { name: node.name, timeoutSeconds: 60 };
  }
  return {
    name: node.name,
    ...(taskConfig.command !== undefined ? { command: taskConfig.command } : {}),
    ...(taskConfig.write_files !== undefined
      ? {
          writeFiles: taskConfig.write_files.map((f) => ({
            path: f.path,
            ...(f.content !== undefined ? { content: f.content } : {}),
            ...(f.lines !== undefined ? { lines: f.lines } : {}),
          })),
        }
      : {}),
    timeoutSeconds: taskConfig.timeout_seconds,
    ...(taskConfig.cwd !== undefined ? { cwd: taskConfig.cwd } : {}),
    ...(taskConfig.env !== undefined ? { env: taskConfig.env } : {}),
  };
}
