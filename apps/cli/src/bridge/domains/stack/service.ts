import { spawnSync } from "node:child_process";
import type {
  LifecycleConfig,
  ServiceRecord,
  StackManagedRecord,
  StackNodeRecord,
  StackSummaryRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { getRepositoryById, markWorkspacePrepared } from "@lifecycle/db/queries";
import {
  clearStackRuntimeServices,
  createStartStackInput,
  declaredServiceNames,
  isPidAlive,
  previewUrlForService,
  readStackRuntimeState,
  resolveBridgePort,
  stackServiceContainerName,
  upsertStackRuntimeService,
} from "../stack";
import { BridgeError } from "../../lib/errors";
import { workspaceTopic } from "../../lib/socket-topics";
import { workspaceHostLabel, type WorkspaceHostRegistry } from "../workspace";
import { resolveWorkspaceRecord } from "../workspace/resolve";

async function broadcastBridgeMessage(message: object, topic?: string): Promise<void> {
  const { broadcastMessage } = await import("../../lib/server");
  broadcastMessage(message, topic);
}

type ServiceLifecycleEventType =
  | "service.starting"
  | "service.started"
  | "service.failed"
  | "service.stopping"
  | "service.stopped";

type ServiceLifecycleMessage = {
  type: ServiceLifecycleEventType;
  workspace_id: string;
  service: string;
  error?: string;
};

export function buildServiceLifecycleMessage(input: {
  error?: string;
  service: string;
  type: ServiceLifecycleEventType;
  workspaceId: string;
}): ServiceLifecycleMessage {
  return {
    type: input.type,
    workspace_id: input.workspaceId,
    service: input.service,
    ...(input.error ? { error: input.error } : {}),
  };
}

function requireWorkspacePath(workspace: WorkspaceRecord): string {
  if (!workspace.workspace_root) {
    throw new Error(`Workspace "${workspace.id}" has no worktree path.`);
  }
  return workspace.workspace_root;
}

type BridgeStackManifest =
  | { state: "missing" }
  | { errors: string[]; state: "invalid" }
  | { config: LifecycleConfig; state: "ready" };

type StackNodes = NonNullable<LifecycleConfig["stack"]>["nodes"];
type ManagedNodeConfig = Extract<StackNodes[string], { kind: "process" | "image" }>;
type TaskNodeConfig = Extract<StackNodes[string], { kind: "task" }>;

function stackNodes(config: LifecycleConfig): StackNodes {
  return (config.stack?.nodes ?? {}) as StackNodes;
}

function hasConfiguredStack(config: LifecycleConfig): boolean {
  return config.stack !== undefined;
}

export async function readWorkspaceStackManifest(
  workspaceRegistry: WorkspaceHostRegistry,
  workspace: WorkspaceRecord,
): Promise<BridgeStackManifest> {
  const manifest = await workspaceRegistry
    .resolve(workspace.host)
    .readManifest(requireWorkspacePath(workspace));

  if (manifest.state === "missing") {
    return { state: "missing" };
  }

  if (manifest.state === "invalid") {
    return {
      errors: manifest.result.errors.map((error) => error.message),
      state: "invalid",
    };
  }

  return {
    config: manifest.result.config,
    state: "ready",
  };
}

function isContainerRunning(containerName: string): boolean {
  const result = spawnSync("docker", ["inspect", "--format", "{{.State.Status}}", containerName], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return false;
  }

  return result.stdout.trim() === "running";
}

function servicePreviewURL(
  hostLabel: string,
  serviceName: string,
  assignedPort: number | null,
): string | null {
  return assignedPort === null
    ? null
    : previewUrlForService(hostLabel, serviceName, resolveBridgePort());
}

function managedNodeRecord(input: {
  config: ManagedNodeConfig;
  hostLabel: string;
  name: string;
  runtimeState: Awaited<ReturnType<typeof readStackRuntimeState>>;
  workspace: WorkspaceRecord;
}): StackManagedRecord {
  const { config, hostLabel, name, runtimeState, workspace } = input;
  const existing = runtimeState.services[name];
  const running =
    existing?.kind === "process"
      ? existing.pid !== null && isPidAlive(existing.pid)
      : existing?.kind === "image"
        ? isContainerRunning(stackServiceContainerName(workspace.id, name))
        : false;

  const createdAt = existing?.created_at ?? workspace.created_at;
  const updatedAt = existing?.updated_at ?? workspace.updated_at;
  const isStarting = existing?.status === "starting";
  const failed = !running && existing?.status === "failed";
  const status = isStarting ? "starting" : running ? "ready" : failed ? "failed" : "stopped";
  const statusReason = status === "failed" ? (existing?.status_reason ?? "unknown") : null;
  const assignedPort = status === "ready" ? (existing?.assigned_port ?? null) : null;

  return {
    assigned_port: assignedPort,
    created_at: createdAt,
    depends_on: config.depends_on ?? [],
    kind: config.kind,
    name,
    preview_url: servicePreviewURL(hostLabel, name, assignedPort),
    status,
    status_reason: statusReason,
    updated_at: updatedAt,
    workspace_id: workspace.id,
  };
}

function taskNodeRecord(input: {
  config: TaskNodeConfig;
  name: string;
  workspace: WorkspaceRecord;
}): StackNodeRecord {
  const { config, name, workspace } = input;
  return {
    command: config.command ?? null,
    depends_on: config.depends_on ?? [],
    kind: "task",
    name,
    run_on: config.run_on ?? null,
    workspace_id: workspace.id,
    write_files_count: config.write_files?.length ?? 0,
  };
}

function stackServiceRecords(summary: StackSummaryRecord): ServiceRecord[] {
  return summary.nodes.flatMap((node) => {
    if (node.kind === "task") {
      return [];
    }

    return [
      {
        assigned_port: node.assigned_port,
        created_at: node.created_at,
        id: `${node.workspace_id}:${node.name}`,
        name: node.name,
        preview_url: node.preview_url,
        status: node.status,
        status_reason: node.status_reason,
        updated_at: node.updated_at,
        workspace_id: node.workspace_id,
      },
    ];
  });
}

export async function healthWorkspaceStack(
  db: SqlDriver,
  workspaceRegistry: WorkspaceHostRegistry,
  workspaceId: string,
): Promise<{
  checks: Array<{
    healthy: boolean;
    message: string | null;
    service: string;
  }>;
  workspace: WorkspaceRecord;
}> {
  const workspace = await resolveWorkspaceRecord(db, workspaceId);
  const services = stackServiceRecords(
    await listWorkspaceStack(db, workspaceRegistry, workspace.id),
  );

  return {
    checks: services.map((service) => ({
      healthy: service.status === "ready",
      message:
        service.status === "ready"
          ? null
          : (service.status_reason ?? `Service is ${service.status}.`),
      service: service.name,
    })),
    workspace,
  };
}

export async function listWorkspaceStack(
  db: SqlDriver,
  workspaceRegistry: WorkspaceHostRegistry,
  workspaceId: string,
): Promise<StackSummaryRecord> {
  const workspace = await resolveWorkspaceRecord(db, workspaceId);
  const manifest = await readWorkspaceStackManifest(workspaceRegistry, workspace);

  if (manifest.state === "missing") {
    return {
      errors: [],
      nodes: [],
      state: "missing",
      workspace_id: workspace.id,
    };
  }

  if (manifest.state === "invalid") {
    return {
      errors: manifest.errors,
      nodes: [],
      state: "invalid",
      workspace_id: workspace.id,
    };
  }

  if (!hasConfiguredStack(manifest.config)) {
    return {
      errors: [],
      nodes: [],
      state: "unconfigured",
      workspace_id: workspace.id,
    };
  }

  const runtimeState = await readStackRuntimeState(workspace.id);
  const hostLabel = workspaceHostLabel(workspace);
  const nodes = Object.entries(stackNodes(manifest.config)).map(
    ([name, node]): StackNodeRecord =>
      node.kind === "task"
        ? taskNodeRecord({
            config: node,
            name,
            workspace,
          })
        : managedNodeRecord({
            config: node,
            hostLabel,
            name,
            runtimeState,
            workspace,
          }),
  );

  return {
    errors: [],
    nodes,
    state: "ready",
    workspace_id: workspace.id,
  };
}

export async function startWorkspaceStack(
  db: SqlDriver,
  workspaceRegistry: WorkspaceHostRegistry,
  workspaceId: string,
  serviceNames?: string[],
): Promise<{
  stack: StackSummaryRecord;
  startedServices: string[];
  workspaceId: string;
}> {
  const workspace = await resolveWorkspaceRecord(db, workspaceId);
  const manifest = await readWorkspaceStackManifest(workspaceRegistry, workspace);
  if (manifest.state === "missing") {
    throw new BridgeError({
      code: "stack_unconfigured",
      message: `Workspace "${workspace.id}" has no lifecycle.json. Stack is unavailable for this workspace.`,
      status: 400,
    });
  }
  if (manifest.state === "invalid") {
    throw new BridgeError({
      code: "stack_manifest_invalid",
      message: manifest.errors[0] ?? "Workspace manifest is invalid.",
      status: 400,
    });
  }
  if (!hasConfiguredStack(manifest.config)) {
    throw new BridgeError({
      code: "stack_unconfigured",
      message: `Workspace "${workspace.id}" does not declare a managed stack.`,
      status: 400,
    });
  }

  const currentServices = stackServiceRecords(
    await listWorkspaceStack(db, workspaceRegistry, workspace.id),
  );
  const currentByName = new Map(currentServices.map((service) => [service.name, service]));
  const workspaceClient = workspaceRegistry.resolve(workspace.host);
  const repository = await getRepositoryById(db, workspace.repository_id);
  if (!repository) {
    throw new BridgeError({
      code: "repository_not_found",
      message: `Could not resolve repository "${workspace.repository_id}" for workspace "${workspace.id}".`,
      status: 404,
    });
  }

  const configByName = new Map(Object.entries(stackNodes(manifest.config)));
  const hostLabel = workspaceHostLabel(workspace);
  let runtimeWriteQueue = Promise.resolve();
  const queueRuntimeWrite = (
    name: string,
    input: {
      assignedPort?: number | null;
      pid?: number | null;
      status: ServiceRecord["status"];
      statusReason: ServiceRecord["status_reason"];
    },
  ) => {
    const config = configByName.get(name);
    if (!config || config.kind === "task") {
      return;
    }

    const existing = currentByName.get(name);
    const now = new Date().toISOString();

    currentByName.set(name, {
      assigned_port: input.assignedPort ?? null,
      created_at: existing?.created_at ?? now,
      id: `${workspace.id}:${name}`,
      name,
      preview_url: servicePreviewURL(hostLabel, name, input.assignedPort ?? null),
      status: input.status,
      status_reason: input.statusReason,
      updated_at: now,
      workspace_id: workspace.id,
    });

    runtimeWriteQueue = runtimeWriteQueue.then(() =>
      upsertStackRuntimeService(workspace.id, {
        assigned_port: input.assignedPort ?? null,
        created_at: existing?.created_at ?? now,
        kind: config.kind,
        name,
        pid: input.pid ?? null,
        status: input.status,
        status_reason: input.statusReason,
        updated_at: now,
      }),
    );
  };

  const baseInput = createStartStackInput({
    hostLabel,
    ...(serviceNames && serviceNames.length > 0 ? { serviceNames } : {}),
    repositorySlug: repository.slug,
    services: currentServices,
    workspace,
  });

  try {
    const result = await workspaceClient.startStack(workspace, manifest.config, {
      ...baseInput,
      callbacks: {
        onServiceStarting: (name) => {
          queueRuntimeWrite(name, {
            status: "starting",
            statusReason: null,
          });

          runtimeWriteQueue = runtimeWriteQueue.then(async () => {
            await broadcastBridgeMessage(
              buildServiceLifecycleMessage({
                service: name,
                type: "service.starting",
                workspaceId: workspace.id,
              }),
              workspaceTopic(workspace.id),
            );
          });
        },
        onServiceReady: (service) => {
          queueRuntimeWrite(service.name, {
            assignedPort: service.assignedPort,
            pid: service.processId,
            status: "ready",
            statusReason: null,
          });

          runtimeWriteQueue = runtimeWriteQueue.then(async () => {
            await broadcastBridgeMessage(
              buildServiceLifecycleMessage({
                service: service.name,
                type: "service.started",
                workspaceId: workspace.id,
              }),
              workspaceTopic(workspace.id),
            );
          });
        },
        onServiceFailed: (name) => {
          queueRuntimeWrite(name, {
            status: "failed",
            statusReason: "service_start_failed",
          });

          runtimeWriteQueue = runtimeWriteQueue.then(async () => {
            await broadcastBridgeMessage(
              buildServiceLifecycleMessage({
                error: "Service failed to start.",
                service: name,
                type: "service.failed",
                workspaceId: workspace.id,
              }),
              workspaceTopic(workspace.id),
            );
          });
        },
      },
    });

    await runtimeWriteQueue;
    if (result.preparedAt && workspace.prepared_at !== result.preparedAt) {
      await markWorkspacePrepared(db, workspace.id, result.preparedAt);
    }

    return {
      stack: await listWorkspaceStack(db, workspaceRegistry, workspace.id),
      startedServices: result.startedServices.map((service) => service.name),
      workspaceId: workspace.id,
    };
  } catch (error) {
    await runtimeWriteQueue;
    throw error;
  }
}

export async function stopWorkspaceStack(
  db: SqlDriver,
  workspaceRegistry: WorkspaceHostRegistry,
  workspaceId: string,
  serviceNames?: string[],
): Promise<{
  stack: StackSummaryRecord;
  stoppedServices: string[];
  workspaceId: string;
}> {
  const workspace = await resolveWorkspaceRecord(db, workspaceId);
  const manifest = await readWorkspaceStackManifest(workspaceRegistry, workspace);
  if (manifest.state === "missing") {
    return {
      stack: await listWorkspaceStack(db, workspaceRegistry, workspace.id),
      stoppedServices: [],
      workspaceId: workspace.id,
    };
  }
  if (manifest.state === "invalid") {
    throw new BridgeError({
      code: "stack_manifest_invalid",
      message: manifest.errors[0] ?? "Workspace manifest is invalid.",
      status: 400,
    });
  }
  if (!hasConfiguredStack(manifest.config)) {
    return {
      stack: await listWorkspaceStack(db, workspaceRegistry, workspace.id),
      stoppedServices: [],
      workspaceId: workspace.id,
    };
  }

  const currentServices = stackServiceRecords(
    await listWorkspaceStack(db, workspaceRegistry, workspace.id),
  );
  const targetNames =
    serviceNames && serviceNames.length > 0 ? serviceNames : declaredServiceNames(manifest.config);
  const activeNames = currentServices
    .filter(
      (service) =>
        targetNames.includes(service.name) &&
        matchesServiceStatus(service.status, ["ready", "starting"]),
    )
    .map((service) => service.name);

  for (const name of activeNames) {
    void broadcastBridgeMessage(
      buildServiceLifecycleMessage({
        service: name,
        type: "service.stopping",
        workspaceId: workspace.id,
      }),
      workspaceTopic(workspace.id),
    );
  }

  const runtimeState = await readStackRuntimeState(workspace.id);
  await workspaceRegistry.resolve(workspace.host).stopStack(workspace, {
    names: targetNames,
    processIds: targetNames.flatMap((name) => {
      const service = runtimeState.services[name];
      return service?.kind === "process" && service.pid !== null ? [service.pid] : [];
    }),
  });
  await clearStackRuntimeServices(workspace.id, targetNames);

  for (const name of activeNames) {
    void broadcastBridgeMessage(
      buildServiceLifecycleMessage({
        service: name,
        type: "service.stopped",
        workspaceId: workspace.id,
      }),
      workspaceTopic(workspace.id),
    );
  }

  return {
    stack: await listWorkspaceStack(db, workspaceRegistry, workspace.id),
    stoppedServices: activeNames,
    workspaceId: workspace.id,
  };
}

function matchesServiceStatus(status: string, allowed: string[]): boolean {
  return allowed.includes(status);
}

export async function resetWorkspaceStack(
  db: SqlDriver,
  workspaceRegistry: WorkspaceHostRegistry,
  workspaceId: string,
): Promise<{
  workspace: WorkspaceRecord;
}> {
  await stopWorkspaceStack(db, workspaceRegistry, workspaceId);
  await startWorkspaceStack(db, workspaceRegistry, workspaceId);

  return {
    workspace: await resolveWorkspaceRecord(db, workspaceId),
  };
}
