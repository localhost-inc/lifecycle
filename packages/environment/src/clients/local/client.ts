import type { LifecycleConfig } from "@lifecycle/contracts";
import type {
  EnvironmentClient,
  StartEnvironmentInput,
  StartEnvironmentResult,
} from "../../client";
import { resolveStartOrder } from "../../graph";
import { buildRuntimeEnv, injectAssignedPortsIntoManifest, resolveServiceEnv } from "../../runtime";

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

interface StepInput {
  name: string;
  command?: string;
  writeFiles?: Array<{ path: string; content?: string; lines?: string[] }>;
  timeoutSeconds: number;
  cwd?: string;
  env?: Record<string, string>;
}

function processId(environmentId: string, name: string): string {
  return `${environmentId}:${name}`;
}

function environmentLogDir(lifecycleRoot: string, environmentId: string): string {
  return `${lifecycleRoot}/logs/environments/${environmentId}`;
}

function resolvePath(rootPath: string, relative: string): string {
  if (relative.startsWith("/")) {
    return relative;
  }
  return `${rootPath}/${relative}`;
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

export interface LocalEnvironmentClientDeps {
  invoke: InvokeFn;
}

export class LocalEnvironmentClient implements EnvironmentClient {
  private invoke: InvokeFn;

  constructor(deps: LocalEnvironmentClientDeps) {
    this.invoke = deps.invoke;
  }

  async start(
    config: LifecycleConfig,
    input: StartEnvironmentInput,
  ): Promise<StartEnvironmentResult> {
    const { prepareSteps, sorted } = resolveStartOrder(config, {
      prepared: input.prepared,
      ...(input.serviceNames ? { targetServices: input.serviceNames } : {}),
      satisfiedServices: new Set(input.readyServiceNames),
    });

    const serviceNames = sorted.filter((n) => n.kind === "service").map((n) => n.name);

    if (prepareSteps.length === 0 && serviceNames.length === 0) {
      return { preparedAt: null };
    }

    // Assign ports.
    const portsResult = (await this.invoke("assign_ports", {
      request: {
        seedId: input.environmentId,
        names: serviceNames,
        currentPorts: input.services.map((s) => ({
          assignedPort: s.assigned_port,
          name: s.name,
          status: s.status,
        })),
      },
    })) as { assignedPorts: Record<string, number> };

    const assignedPorts = portsResult.assignedPorts;
    const nextServices = input.services.map((s) => ({
      ...s,
      assigned_port: assignedPorts[s.name] ?? s.assigned_port,
    }));
    const lifecycleRoot = (await this.invoke("resolve_lifecycle_root_path")) as string;
    const previewProxyPort = (await this.invoke("get_preview_proxy_port")) as number;
    const runtimeConfig = injectAssignedPortsIntoManifest(config, assignedPorts);
    const configByName = new Map(Object.entries(runtimeConfig.environment));

    const runtimeEnv = buildRuntimeEnv({
      environmentId: input.environmentId,
      hostLabel: input.hostLabel,
      name: input.name,
      previewProxyPort,
      rootPath: input.rootPath,
      services: nextServices,
      sourceRef: input.sourceRef,
    });

    // Run prepare steps.
    for (const step of prepareSteps) {
      await this.runStep(input.environmentId, input.rootPath, runtimeEnv, {
        name: step.name,
        timeoutSeconds: 0,
      });
    }

    // Walk the dependency graph.
    for (const node of sorted) {
      if (node.kind === "task") {
        const taskConfig = config.environment[node.name];
        const step: StepInput =
          taskConfig && taskConfig.kind === "task"
            ? {
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
              }
            : { name: node.name, timeoutSeconds: 60 };

        await this.runStep(input.environmentId, input.rootPath, runtimeEnv, step);
      } else {
        await this.startService(
          input.environmentId,
          lifecycleRoot,
          node.name,
          configByName,
          assignedPorts,
          input,
          runtimeEnv,
        );
      }
    }

    return {
      preparedAt: !input.prepared && prepareSteps.length > 0 ? new Date().toISOString() : null,
    };
  }

  async stop(environmentId: string, names: string[]): Promise<void> {
    for (const name of names) {
      const id = processId(environmentId, name);
      await this.invoke("kill_managed_process", { id });
      await this.invoke("stop_managed_container", { id });
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async runStep(
    environmentId: string,
    rootPath: string,
    runtimeEnv: Record<string, string>,
    step: StepInput,
  ): Promise<void> {
    await this.invoke("run_shell_step", {
      request: {
        processId: `${environmentId}:step:${step.name}`,
        rootPath,
        name: step.name,
        command: step.command ?? null,
        writeFiles: step.writeFiles ?? null,
        timeoutSeconds: step.timeoutSeconds,
        cwd: step.cwd ?? null,
        env: step.env ?? null,
        runtimeEnv,
      },
    });
  }

  private async startService(
    environmentId: string,
    lifecycleRoot: string,
    serviceName: string,
    configByName: Map<string, LifecycleConfig["environment"][string]>,
    assignedPorts: Record<string, number>,
    input: StartEnvironmentInput,
    runtimeEnv: Record<string, string>,
  ): Promise<void> {
    const serviceConfig = configByName.get(serviceName);
    if (!serviceConfig || serviceConfig.kind !== "service") {
      throw new Error(`"${serviceName}" is not a service in the manifest.`);
    }

    const id = processId(environmentId, serviceName);

    if (serviceConfig.runtime === "process") {
      const cwd = serviceConfig.cwd ? `${input.rootPath}/${serviceConfig.cwd}` : input.rootPath;
      const env = resolveServiceEnv(
        serviceConfig.env,
        runtimeEnv,
        `environment.${serviceName}.env`,
      );
      await this.invoke("spawn_managed_process", {
        request: {
          id,
          binary: "sh",
          args: ["-c", serviceConfig.command],
          cwd,
          env,
          logDir: environmentLogDir(lifecycleRoot, environmentId),
        },
      });
    } else if (serviceConfig.runtime === "image") {
      await this.startImageService(
        id,
        environmentId,
        serviceName,
        serviceConfig,
        input,
        runtimeEnv,
        assignedPorts,
      );
    }

    if (serviceConfig.health_check) {
      await this.invoke("wait_for_health", {
        input: this.buildHealthCheckInput(serviceConfig.health_check, runtimeEnv),
        startupTimeoutSeconds: serviceConfig.startup_timeout_seconds ?? 60,
        containerRef: null,
      });
    }
  }

  private async startImageService(
    id: string,
    environmentId: string,
    serviceName: string,
    serviceConfig: Extract<
      LifecycleConfig["environment"][string],
      { kind: "service"; runtime: "image" }
    >,
    input: StartEnvironmentInput,
    runtimeEnv: Record<string, string>,
    assignedPorts: Record<string, number>,
  ): Promise<void> {
    let imageRef = serviceConfig.image;

    if (serviceConfig.build) {
      const contextPath = resolvePath(input.rootPath, serviceConfig.build.context);
      const dockerfilePath = serviceConfig.build.dockerfile
        ? resolvePath(input.rootPath, serviceConfig.build.dockerfile)
        : undefined;
      const tag = `lifecycle-${sanitize(environmentId)}-${sanitize(serviceName)}`;
      await this.invoke("build_docker_image", {
        tag,
        contextPath,
        dockerfilePath: dockerfilePath ?? null,
      });
      imageRef = tag;
    } else if (imageRef) {
      await this.invoke("pull_docker_image", { image: imageRef });
    } else {
      throw new Error(`Image service "${serviceName}" requires either image or build.`);
    }

    const envEntries = resolveServiceEnv(
      serviceConfig.env,
      runtimeEnv,
      `environment.${serviceName}.env`,
    );
    const env = Object.entries(envEntries).map(([key, value]) => `${key}=${value}`);

    const portBindings: Array<{ containerPort: number; hostPort: number }> = [];
    if (serviceConfig.port) {
      const hostPort = assignedPorts[serviceName] ?? serviceConfig.port;
      portBindings.push({ containerPort: serviceConfig.port, hostPort });
    }

    const binds: string[] = [];
    for (const volume of serviceConfig.volumes ?? []) {
      const hostPath =
        volume.type === "bind" ? resolvePath(input.rootPath, volume.source) : volume.source;
      let bind = `${hostPath}:${volume.target}`;
      if (volume.read_only) {
        bind += ":ro";
      }
      binds.push(bind);
    }

    let cmd: string[] | undefined;
    if (serviceConfig.command) {
      cmd = [serviceConfig.command, ...(serviceConfig.args ?? [])];
    } else if (serviceConfig.args) {
      cmd = serviceConfig.args;
    }

    await this.invoke("start_managed_container", {
      request: {
        id,
        image: imageRef!,
        containerName: `lifecycle-${environmentId}-${serviceName}`,
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
    if (hc.kind === "tcp") {
      return {
        kind: "tcp",
        host: maybeExpandTemplate(hc.host, runtimeEnv),
        port:
          typeof hc.port === "number"
            ? hc.port
            : Number(maybeExpandTemplate(String(hc.port), runtimeEnv)),
        timeoutSeconds: hc.timeout_seconds,
      };
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
}
