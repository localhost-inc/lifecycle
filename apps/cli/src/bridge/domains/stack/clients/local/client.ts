import type { LifecycleConfig } from "@lifecycle/contracts";
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { StartStackInput, StartStackResult } from "../../client";
import { resolveStartOrder } from "../../graph";
import type { HealthCheck } from "../../health";
import { waitForHealth } from "../../health";
import { stackLogDir } from "../../logs/path";
import { assignPorts } from "../../ports";
import {
  buildStackEnv,
  expandRuntimeTemplates,
  injectAssignedPortsIntoManifest,
  resolveBridgePort,
  resolveServiceEnv,
} from "../../runtime";
import { stackServiceContainerName, stackServiceProcessID } from "../../runtime-ids";
import { ProcessSupervisor } from "../../supervisor";

type StackNodes = NonNullable<LifecycleConfig["stack"]>["nodes"];
type ManagedNodeConfig = Extract<StackNodes[string], { kind: "process" | "image" }>;
type ImageNodeConfig = Extract<StackNodes[string], { kind: "image" }>;

function lifecycleRootPath(): string {
  if (process.env.LIFECYCLE_ROOT) {
    return process.env.LIFECYCLE_ROOT;
  }
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
  return resolve(home, ".lifecycle");
}

function resolvePath(rootPath: string, relative: string): string {
  if (relative.startsWith("/")) return relative;
  return resolve(rootPath, relative);
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export class LocalStackClient {
  private supervisor: ProcessSupervisor;

  constructor(supervisor?: ProcessSupervisor) {
    this.supervisor = supervisor ?? new ProcessSupervisor();
  }

  getSupervisor(): ProcessSupervisor {
    return this.supervisor;
  }

  async start(config: LifecycleConfig, input: StartStackInput): Promise<StartStackResult> {
    const { prepareSteps, sorted } = resolveStartOrder(config, {
      prepared: input.prepared,
      ...(input.serviceNames ? { targetServices: input.serviceNames } : {}),
      satisfiedServices: new Set(input.readyServiceNames),
    });

    const serviceNames = sorted.filter((n) => n.kind !== "task").map((n) => n.name);

    if (prepareSteps.length === 0 && serviceNames.length === 0) {
      return { preparedAt: null, startedServices: [] };
    }

    // Assign ports.
    const assignedPorts = await assignPorts(
      input.stackId,
      serviceNames,
      input.services.map((s) => ({
        assignedPort: s.assigned_port,
        name: s.name,
        status: s.status,
      })),
    );

    const nextServices = input.services.map((s) => ({
      ...s,
      assigned_port: assignedPorts[s.name] ?? s.assigned_port,
    }));

    const logDir = stackLogDir(lifecycleRootPath(), input.logScope);
    const runtimeConfig = injectAssignedPortsIntoManifest(config, assignedPorts);
    const configByName = new Map(Object.entries(runtimeConfig.stack?.nodes ?? {}));

    // The bridge owns the fixed local listener for both API traffic and
    // lifecycle.localhost preview routing.
    const bridgePort = resolveBridgePort();

    const runtimeEnv = buildStackEnv({
      bridgePort,
      stackId: input.stackId,
      hostLabel: input.hostLabel,
      name: input.name,
      rootPath: input.rootPath,
      services: nextServices,
      sourceRef: input.sourceRef,
    });

    // Run prepare steps.
    for (const step of prepareSteps) {
      const prepareConfig = config.workspace.prepare.find((s) => s.name === step.name);
      if (prepareConfig) {
        this.runStep(input.rootPath, runtimeEnv, prepareConfig);
      }
    }

    // Walk the dependency graph.
    const startedServiceNames: string[] = [];
    for (const node of sorted) {
      if (node.kind === "task") {
        const taskConfig = config.stack?.nodes?.[node.name];
        if (taskConfig && taskConfig.kind === "task") {
          this.runStep(input.rootPath, runtimeEnv, taskConfig);
        }
      } else {
        input.callbacks?.onServiceStarting?.(node.name);
        try {
          const processId = await this.startService(
            input.stackId,
            node.name,
            configByName,
            assignedPorts,
            input,
            runtimeEnv,
            logDir,
          );
          const started = {
            assignedPort: assignedPorts[node.name] ?? null,
            name: node.name,
            processId,
          };
          startedServiceNames.push(node.name);
          input.callbacks?.onServiceReady?.(started);
        } catch (err) {
          input.callbacks?.onServiceFailed?.(node.name);
          throw err;
        }
      }
    }

    return {
      preparedAt: !input.prepared && prepareSteps.length > 0 ? new Date().toISOString() : null,
      startedServices: startedServiceNames.map((name) => ({
        assignedPort: assignedPorts[name] ?? null,
        name,
        processId: this.supervisor.pid(stackServiceProcessID(input.stackId, name)),
      })),
    };
  }

  async stop(stackId: string, names: string[]): Promise<void> {
    for (const name of names) {
      const id = stackServiceProcessID(stackId, name);
      this.supervisor.kill(id);
      // Also try stopping a docker container with this id.
      try {
        const containerName = stackServiceContainerName(stackId, name);
        spawnSync("docker", ["stop", containerName], {
          stdio: "ignore",
          timeout: 10_000,
        });
        spawnSync("docker", ["rm", "-f", containerName], {
          stdio: "ignore",
          timeout: 5_000,
        });
      } catch {
        // Container may not exist.
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private runStep(
    rootPath: string,
    runtimeEnv: Record<string, string>,
    step: {
      command?: string | undefined;
      write_files?:
        | Array<{ path: string; content?: string | undefined; lines?: string[] | undefined }>
        | undefined;
      cwd?: string | undefined;
      env?: Record<string, string> | undefined;
      timeout_seconds: number;
    },
  ): void {
    if (step.write_files) {
      for (const file of step.write_files) {
        const filePath = resolvePath(rootPath, file.path);
        mkdirSync(dirname(filePath), { recursive: true });
        const content = file.content ?? (file.lines ? file.lines.join("\n") + "\n" : "");
        writeFileSync(filePath, content, "utf8");
      }
      return;
    }

    if (step.command) {
      const cwd = step.cwd ? resolvePath(rootPath, step.cwd) : rootPath;
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...runtimeEnv,
      };
      if (step.env) {
        for (const [key, value] of Object.entries(step.env)) {
          env[key] = expandRuntimeTemplates(value, runtimeEnv);
        }
      }
      execSync(step.command, {
        cwd,
        env,
        stdio: "pipe",
        timeout: step.timeout_seconds > 0 ? step.timeout_seconds * 1000 : undefined,
      });
    }
  }

  private async startService(
    stackId: string,
    serviceName: string,
    configByName: Map<string, StackNodes[string]>,
    assignedPorts: Record<string, number>,
    input: StartStackInput,
    runtimeEnv: Record<string, string>,
    logDir: string,
  ): Promise<number | null> {
    const serviceConfig = configByName.get(serviceName);
    if (!serviceConfig || serviceConfig.kind === "task") {
      throw new Error(`"${serviceName}" is not a service in the manifest.`);
    }

    const id = stackServiceProcessID(stackId, serviceName);

    if (serviceConfig.kind === "process") {
      const cwd = serviceConfig.cwd
        ? resolvePath(input.rootPath, serviceConfig.cwd)
        : input.rootPath;
      const env = resolveServiceEnv(serviceConfig.env, runtimeEnv, `stack.${serviceName}.env`);

      const pid = this.supervisor.spawn(id, {
        binary: "sh",
        args: ["-c", serviceConfig.command],
        cwd,
        env,
        logDir,
      });
      if (serviceConfig.health_check) {
        const check = this.buildHealthCheck(serviceConfig.health_check, runtimeEnv);
        await waitForHealth(check, serviceConfig.startup_timeout_seconds ?? 60, null);
      }
      return pid;
    } else if (serviceConfig.kind === "image") {
      await this.startImageService(
        id,
        stackId,
        serviceName,
        serviceConfig,
        input,
        runtimeEnv,
        assignedPorts,
      );
      if (serviceConfig.health_check) {
        const check = this.buildHealthCheck(serviceConfig.health_check, runtimeEnv);
        const containerRef = `lifecycle-${stackId}-${serviceName}`;
        await waitForHealth(check, serviceConfig.startup_timeout_seconds ?? 60, containerRef);
      }
      return null;
    }

    return null;
  }

  private async startImageService(
    id: string,
    stackId: string,
    serviceName: string,
    serviceConfig: ImageNodeConfig,
    input: StartStackInput,
    runtimeEnv: Record<string, string>,
    assignedPorts: Record<string, number>,
  ): Promise<void> {
    let imageRef = serviceConfig.image;

    if (serviceConfig.build) {
      const contextPath = resolvePath(input.rootPath, serviceConfig.build.context);
      const tag = `lifecycle-${sanitize(stackId)}-${sanitize(serviceName)}`;
      const buildArgs = ["build", "-t", tag];
      if (serviceConfig.build.dockerfile) {
        buildArgs.push("-f", resolvePath(input.rootPath, serviceConfig.build.dockerfile));
      }
      buildArgs.push(contextPath);
      const buildResult = spawnSync("docker", buildArgs, { stdio: "pipe", timeout: 300_000 });
      if (buildResult.status !== 0) {
        throw new Error(
          `Docker build failed for ${serviceName}: ${buildResult.stderr?.toString().trim()}`,
        );
      }
      imageRef = tag;
    } else if (imageRef) {
      const pullResult = spawnSync("docker", ["pull", imageRef], {
        stdio: "pipe",
        timeout: 300_000,
      });
      if (pullResult.status !== 0) {
        throw new Error(
          `Docker pull failed for ${imageRef}: ${pullResult.stderr?.toString().trim()}`,
        );
      }
    } else {
      throw new Error(`Image service "${serviceName}" requires either image or build.`);
    }

    const envEntries = resolveServiceEnv(serviceConfig.env, runtimeEnv, `stack.${serviceName}.env`);
    const containerName = stackServiceContainerName(stackId, serviceName);

    // Remove existing container.
    spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });

    const runArgs = ["run", "-d", "--name", containerName];

    for (const [key, value] of Object.entries(envEntries)) {
      runArgs.push("-e", `${key}=${value}`);
    }

    if (serviceConfig.port) {
      const hostPort = assignedPorts[serviceName] ?? serviceConfig.port;
      runArgs.push("-p", `127.0.0.1:${hostPort}:${serviceConfig.port}`);
    }

    for (const volume of serviceConfig.volumes ?? []) {
      const hostPath =
        volume.type === "bind" ? resolvePath(input.rootPath, volume.source) : volume.source;
      let bind = `${hostPath}:${volume.target}`;
      if (volume.read_only) bind += ":ro";
      runArgs.push("-v", bind);
    }

    runArgs.push(imageRef!);

    if (serviceConfig.command) {
      runArgs.push(serviceConfig.command);
      if (serviceConfig.args) runArgs.push(...serviceConfig.args);
    } else if (serviceConfig.args) {
      runArgs.push(...serviceConfig.args);
    }

    const runResult = spawnSync("docker", runArgs, { stdio: "pipe", timeout: 60_000 });
    if (runResult.status !== 0) {
      throw new Error(
        `Docker run failed for ${serviceName}: ${runResult.stderr?.toString().trim()}`,
      );
    }
  }

  private buildHealthCheck(
    hc: NonNullable<ManagedNodeConfig["health_check"]>,
    runtimeEnv: Record<string, string>,
  ): HealthCheck {
    if (hc.kind === "tcp") {
      return {
        kind: "tcp",
        host: expandRuntimeTemplates(hc.host, runtimeEnv),
        port:
          typeof hc.port === "number"
            ? hc.port
            : Number(expandRuntimeTemplates(String(hc.port), runtimeEnv)),
        timeoutSeconds: hc.timeout_seconds,
      };
    }
    if (hc.kind === "http") {
      return {
        kind: "http",
        url: expandRuntimeTemplates(hc.url, runtimeEnv),
        timeoutSeconds: hc.timeout_seconds,
      };
    }
    return { kind: "container", timeoutSeconds: hc.timeout_seconds };
  }
}
