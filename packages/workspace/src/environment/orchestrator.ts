import type { LifecycleConfig } from "@lifecycle/contracts";
import { resolveStartOrder } from "./graph";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StartEnvironmentInput {
  workspaceId: string;
  manifestJson: string;
  manifestFingerprint: string;
  serviceNames?: string[];
}

export interface PrepareStartInput {
  workspaceId: string;
  manifestJson: string;
  manifestFingerprint: string;
  serviceNames: string[];
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
  ): Promise<void> {
    const { workspaceId } = input;

    const prepared = await this.isPrepared(workspaceId);
    const satisfiedServices = await this.getReadyServices(workspaceId);

    const { prepareSteps, sorted } = resolveStartOrder(config, {
      prepared,
      ...(input.serviceNames ? { targetServices: input.serviceNames } : {}),
      satisfiedServices,
    });

    const serviceNames = sorted
      .filter((n) => n.kind === "service")
      .map((n) => n.name);

    if (prepareSteps.length === 0 && serviceNames.length === 0) {
      return;
    }

    await this.prepareStart({
      workspaceId,
      manifestJson: input.manifestJson,
      manifestFingerprint: input.manifestFingerprint,
      serviceNames,
    });

    for (const step of prepareSteps) {
      await this.runStep(workspaceId, prepareStepToInput(step));
    }

    for (const node of sorted) {
      if (node.kind === "task") {
        await this.runStep(
          workspaceId,
          taskNodeToInput(node, config),
        );
      } else {
        await this.startService(workspaceId, node.name);
      }
    }

    if (!prepared && prepareSteps.length > 0) {
      await this.markPrepared(workspaceId);
    }
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
  abstract markPrepared(workspaceId: string): Promise<void>;
  abstract getReadyServices(workspaceId: string): Promise<Set<string>>;
  abstract isPrepared(workspaceId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prepareStepToInput(step: {
  name: string;
  runOn?: "create" | "start";
}): StepInput {
  return { name: step.name, timeoutSeconds: 0 };
}

function taskNodeToInput(
  node: { name: string },
  config: LifecycleConfig,
): StepInput {
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
