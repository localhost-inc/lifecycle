import {
  EnvironmentOrchestrator,
  type PrepareStartInput,
  type PrepareStartResult,
  type StepInput,
} from "../../environment/orchestrator";
import {
  buildWorkspaceRuntimeEnv,
  injectAssignedPortsIntoManifest,
  resolveServiceEnv,
} from "../../environment/runtime";
import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

interface ActiveStartContext {
  config: LifecycleConfig;
  logDir: string;
  services: ServiceRecord[];
  workspace: WorkspaceRecord;
  worktreePath: string;
}

function processId(workspaceId: string, serviceName: string): string {
  return `${workspaceId}:${serviceName}`;
}

export class LocalEnvironmentOrchestrator extends EnvironmentOrchestrator {
  private invoke: InvokeFn;
  private activeAssignedPorts: Record<string, number> = {};
  private activeRuntimeEnv: Record<string, string> | null = null;
  private activeServiceConfigByName: Map<string, LifecycleConfig["environment"][string]> | null =
    null;
  private activeStartContext: ActiveStartContext | null = null;
  private activeStopServiceNames: string[] = [];

  constructor(invoke: InvokeFn) {
    super();
    this.invoke = invoke;
  }

  primeStartContext(context: ActiveStartContext): void {
    this.activeStartContext = context;
    this.activeAssignedPorts = {};
    this.activeRuntimeEnv = null;
    this.activeServiceConfigByName = null;
  }

  primeStopContext(serviceNames: string[]): void {
    this.activeStopServiceNames = serviceNames;
  }

  async prepareStart(input: PrepareStartInput): Promise<PrepareStartResult> {
    const activeContext = this.requireActiveStartContext();
    const [portsResult, previewProxyPort] = await Promise.all([
      this.invoke("assign_ports", {
        request: {
          seedId: input.workspaceId,
          serviceNames: input.serviceNames,
          currentPorts: input.services.map((service) => ({
            assignedPort: service.assigned_port,
            name: service.name,
            status: service.status,
          })),
        },
      }) as Promise<{ assignedPorts: Record<string, number> }>,
      this.invoke("get_preview_proxy_port") as Promise<number>,
    ]);

    const result = {
      assignedPorts: portsResult.assignedPorts,
      previewProxyPort,
      serviceNames: input.serviceNames,
    };

    const nextServices = activeContext.services.map((service) => ({
      ...service,
      assigned_port: result.assignedPorts[service.name] ?? service.assigned_port,
    }));
    const runtimeConfig = injectAssignedPortsIntoManifest(
      activeContext.config,
      result.assignedPorts,
    );

    this.activeAssignedPorts = result.assignedPorts;
    this.activeServiceConfigByName = new Map(Object.entries(runtimeConfig.environment));
    this.activeRuntimeEnv = buildWorkspaceRuntimeEnv({
      previewProxyPort: result.previewProxyPort,
      services: nextServices,
      workspace: activeContext.workspace,
      worktreePath: activeContext.worktreePath,
    });

    return result;
  }

  async runStep(workspaceId: string, step: StepInput): Promise<void> {
    const activeContext = this.requireActiveStartContext();
    await this.invoke("run_shell_step", {
      request: {
        processId: `${workspaceId}:step:${step.name}`,
        rootPath: activeContext.worktreePath,
        name: step.name,
        command: step.command ?? null,
        writeFiles: step.writeFiles ?? null,
        timeoutSeconds: step.timeoutSeconds,
        cwd: step.cwd ?? null,
        env: step.env ?? null,
        runtimeEnv: this.requireActiveRuntimeEnv(),
      },
    });
  }

  async startService(workspaceId: string, serviceName: string): Promise<void> {
    const activeContext = this.requireActiveStartContext();
    const serviceConfig = this.activeServiceConfigByName?.get(serviceName);
    if (!serviceConfig || serviceConfig.kind !== "service") {
      throw new Error(`Service "${serviceName}" is not available in the active manifest.`);
    }

    const runtimeEnv = this.requireActiveRuntimeEnv();
    const id = processId(workspaceId, serviceName);

    if (serviceConfig.runtime === "process") {
      await this.startProcessService(id, serviceName, serviceConfig, activeContext, runtimeEnv);
    } else if (serviceConfig.runtime === "image") {
      await this.startImageService(
        id,
        workspaceId,
        serviceName,
        serviceConfig,
        activeContext,
        runtimeEnv,
      );
    }

    // Health check if configured.
    if (serviceConfig.health_check) {
      const hc = serviceConfig.health_check;
      const containerResult =
        serviceConfig.runtime === "image"
          ? ((await this.invoke("get_managed_container_id", { id })) as string | null)
          : null;

      await this.invoke("wait_for_health", {
        input: this.buildHealthCheckInput(hc, runtimeEnv),
        startupTimeoutSeconds: serviceConfig.startup_timeout_seconds ?? 60,
        containerRef: containerResult,
      });
    }
  }

  async stopService(workspaceId: string, serviceName: string): Promise<void> {
    const id = processId(workspaceId, serviceName);
    // Try both — process and container. Only one will match.
    await this.invoke("kill_managed_process", { id });
    await this.invoke("stop_managed_container", { id });
  }

  async stopAll(workspaceId: string): Promise<void> {
    for (const serviceName of this.activeStopServiceNames) {
      await this.stopService(workspaceId, serviceName);
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async startProcessService(
    id: string,
    serviceName: string,
    serviceConfig: Extract<
      LifecycleConfig["environment"][string],
      { kind: "service"; runtime: "process" }
    >,
    context: ActiveStartContext,
    runtimeEnv: Record<string, string>,
  ): Promise<void> {
    const cwd = serviceConfig.cwd
      ? `${context.worktreePath}/${serviceConfig.cwd}`
      : context.worktreePath;

    const env = resolveServiceEnv(serviceConfig.env, runtimeEnv, `environment.${serviceName}.env`);

    await this.invoke("spawn_managed_process", {
      request: {
        id,
        binary: "sh",
        args: ["-c", serviceConfig.command],
        cwd,
        env,
        logDir: this.requireLogDir(),
      },
    });
  }

  private async startImageService(
    id: string,
    workspaceId: string,
    serviceName: string,
    serviceConfig: Extract<
      LifecycleConfig["environment"][string],
      { kind: "service"; runtime: "image" }
    >,
    context: ActiveStartContext,
    runtimeEnv: Record<string, string>,
  ): Promise<void> {
    // Resolve image (pull or build).
    if (serviceConfig.build) {
      const contextPath = resolvePath(context.worktreePath, serviceConfig.build.context);
      const dockerfilePath = serviceConfig.build.dockerfile
        ? resolvePath(context.worktreePath, serviceConfig.build.dockerfile)
        : undefined;
      const tag = `lifecycle-${sanitize(workspaceId)}-${sanitize(serviceName)}`;
      await this.invoke("build_docker_image", {
        tag,
        contextPath,
        dockerfilePath: dockerfilePath ?? null,
      });
      serviceConfig = { ...serviceConfig, image: tag };
    } else if (serviceConfig.image) {
      await this.invoke("pull_docker_image", { image: serviceConfig.image });
    } else {
      throw new Error(`Image service "${serviceName}" requires either image or build.`);
    }

    // Build env.
    const envEntries = resolveServiceEnv(
      serviceConfig.env,
      runtimeEnv,
      `environment.${serviceName}.env`,
    );
    const env = Object.entries(envEntries).map(([key, value]) => `${key}=${value}`);

    // Build port bindings.
    const portBindings: Array<{ containerPort: number; hostPort: number }> = [];
    if (serviceConfig.port) {
      const hostPort = this.activeAssignedPorts[serviceName] ?? serviceConfig.port;
      portBindings.push({ containerPort: serviceConfig.port, hostPort });
    }

    // Build volume binds.
    const binds: string[] = [];
    for (const volume of serviceConfig.volumes ?? []) {
      const hostPath =
        volume.type === "bind" ? resolvePath(context.worktreePath, volume.source) : volume.source; // named volumes are just names
      let bind = `${hostPath}:${volume.target}`;
      if (volume.read_only) {
        bind += ":ro";
      }
      binds.push(bind);
    }

    // Build cmd.
    let cmd: string[] | undefined;
    if (serviceConfig.command) {
      cmd = [serviceConfig.command, ...(serviceConfig.args ?? [])];
    } else if (serviceConfig.args) {
      cmd = serviceConfig.args;
    }

    await this.invoke("start_managed_container", {
      request: {
        id,
        image: serviceConfig.image!,
        containerName: `lifecycle-${workspaceId}-${serviceName}`,
        env,
        cmd: cmd ?? null,
        portBindings,
        binds,
      },
    });
  }

  private buildHealthCheckInput(
    hc: NonNullable<
      Extract<LifecycleConfig["environment"][string], { kind: "service" }>["health_check"]
    >,
    runtimeEnv: Record<string, string>,
  ): Record<string, unknown> {
    // The Rust check_health command expects a tagged union with "kind".
    // Template values in host/port/url are already expanded in runtimeEnv.
    if (hc.kind === "tcp") {
      const host = maybeExpandTemplate(hc.host, runtimeEnv);
      const port =
        typeof hc.port === "number"
          ? hc.port
          : Number(maybeExpandTemplate(String(hc.port), runtimeEnv));
      return { kind: "tcp", host, port, timeoutSeconds: hc.timeout_seconds };
    }
    if (hc.kind === "http") {
      return {
        kind: "http",
        url: maybeExpandTemplate(hc.url, runtimeEnv),
        timeoutSeconds: hc.timeout_seconds,
      };
    }
    return { kind: "container", timeoutSeconds: hc.timeout_seconds };
  }

  private requireActiveRuntimeEnv(): Record<string, string> {
    if (this.activeRuntimeEnv === null) {
      throw new Error("Local environment runtime context has not been prepared.");
    }
    return this.activeRuntimeEnv;
  }

  private requireActiveStartContext(): ActiveStartContext {
    if (this.activeStartContext === null) {
      throw new Error("Local environment start context has not been initialized.");
    }
    return this.activeStartContext;
  }

  private requireLogDir(): string {
    return this.requireActiveStartContext().logDir;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePath(worktreePath: string, relative: string): string {
  if (relative.startsWith("/")) {
    return relative;
  }
  return `${worktreePath}/${relative}`;
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function maybeExpandTemplate(value: string, env: Record<string, string>): string {
  const match = /^\$\{(LIFECYCLE_[^}]+)\}$/.exec(value);
  if (!match?.[1]) {
    return value;
  }
  return env[match[1]] ?? value;
}
