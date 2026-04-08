import { spawnSync } from "node:child_process";
import type {
  LifecycleConfig,
  ServiceRecord,
  StackNodeRecord,
  StackSummaryRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { getRepositoryById } from "@lifecycle/db/queries";
import {
  clearStackRuntimeServices,
  createStartStackInput,
  declaredServiceNames,
  isPidAlive,
  readStackRuntimeState,
  stackServiceContainerName,
  slugify,
  upsertStackRuntimeService,
} from "@lifecycle/stack";
import type { WorkspaceClientRegistry } from "@lifecycle/workspace";

import { BridgeError } from "./errors";
import { broadcastMessage } from "./server";
import { resolveBridgeWorkspaceRecord } from "./workspaces";

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

export async function readWorkspaceStackManifest(
  workspaceRegistry: WorkspaceClientRegistry,
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

function servicePreviewURL(assignedPort: number | null): string | null {
  return assignedPort === null ? null : `http://localhost:${assignedPort}`;
}

function serviceNodeRecord(input: {
  config: Extract<LifecycleConfig["stack"][string], { kind: "service" }>;
  name: string;
  runtimeState: Awaited<ReturnType<typeof readStackRuntimeState>>;
  workspace: WorkspaceRecord;
}): StackNodeRecord {
  const { config, name, runtimeState, workspace } = input;
  const existing = runtimeState.services[name];
  const running =
    existing?.runtime === "process"
      ? existing.pid !== null && isPidAlive(existing.pid)
      : existing?.runtime === "image"
        ? isContainerRunning(stackServiceContainerName(workspace.id, name))
        : false;

  const createdAt = existing?.created_at ?? workspace.created_at;
  const updatedAt = existing?.updated_at ?? workspace.updated_at;
  const failed = !running && existing?.status === "failed";
  const status = running ? "ready" : failed ? "failed" : "stopped";
  const statusReason = failed ? (existing?.status_reason ?? "unknown") : null;
  const assignedPort = running ? (existing?.assigned_port ?? null) : null;

  return {
    assigned_port: assignedPort,
    created_at: createdAt,
    depends_on: config.depends_on ?? [],
    kind: "service",
    name,
    preview_url: servicePreviewURL(assignedPort),
    runtime: config.runtime,
    status,
    status_reason: statusReason,
    updated_at: updatedAt,
    workspace_id: workspace.id,
  };
}

function taskNodeRecord(input: {
  config: Extract<LifecycleConfig["stack"][string], { kind: "task" }>;
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
    if (node.kind !== "service") {
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

export async function listWorkspaceStack(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
): Promise<StackSummaryRecord> {
  const workspace = await resolveBridgeWorkspaceRecord(db, workspaceId);
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

  const runtimeState = await readStackRuntimeState(workspace.id);
  const nodes = Object.entries(manifest.config.stack).map(
    ([name, node]): StackNodeRecord =>
      node.kind === "service"
        ? serviceNodeRecord({
            config: node,
            name,
            runtimeState,
            workspace,
          })
        : taskNodeRecord({
            config: node,
            name,
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
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
  serviceNames?: string[],
): Promise<{
  stack: StackSummaryRecord;
  startedServices: string[];
  workspaceId: string;
}> {
  const workspace = await resolveBridgeWorkspaceRecord(db, workspaceId);
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

  const configByName = new Map(Object.entries(manifest.config.stack));
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
    if (!config || config.kind !== "service") {
      return;
    }

    const existing = currentByName.get(name);
    const now = new Date().toISOString();

    currentByName.set(name, {
      assigned_port: input.assignedPort ?? null,
      created_at: existing?.created_at ?? now,
      id: `${workspace.id}:${name}`,
      name,
      preview_url:
        input.assignedPort === null || input.assignedPort === undefined
          ? null
          : `http://localhost:${input.assignedPort}`,
      status: input.status,
      status_reason: input.statusReason,
      updated_at: now,
      workspace_id: workspace.id,
    });

    runtimeWriteQueue = runtimeWriteQueue.then(() =>
      upsertStackRuntimeService(workspace.id, {
        assigned_port: input.assignedPort ?? null,
        created_at: existing?.created_at ?? now,
        name,
        pid: input.pid ?? null,
        runtime: config.runtime,
        status: input.status,
        status_reason: input.statusReason,
        updated_at: now,
      }),
    );
  };

  const baseInput = createStartStackInput({
    hostLabel: slugify(workspace.name),
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
        },
        onServiceReady: (service) => {
          queueRuntimeWrite(service.name, {
            assignedPort: service.assignedPort,
            pid: service.processId,
            status: "ready",
            statusReason: null,
          });

          broadcastMessage({
            type: "service.started",
            workspace_id: workspace.id,
            service: service.name,
          });
        },
        onServiceFailed: (name) => {
          queueRuntimeWrite(name, {
            status: "failed",
            statusReason: "service_start_failed",
          });

          broadcastMessage({
            type: "service.failed",
            workspace_id: workspace.id,
            service: name,
            error: "Service failed to start.",
          });
        },
      },
    });

    await runtimeWriteQueue;

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
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
  serviceNames?: string[],
): Promise<{
  stack: StackSummaryRecord;
  stoppedServices: string[];
  workspaceId: string;
}> {
  const workspace = await resolveBridgeWorkspaceRecord(db, workspaceId);
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

  const currentServices = stackServiceRecords(
    await listWorkspaceStack(db, workspaceRegistry, workspace.id),
  );
  const targetNames =
    serviceNames && serviceNames.length > 0 ? serviceNames : declaredServiceNames(manifest.config);
  const runningNames = currentServices
    .filter((service) => targetNames.includes(service.name) && service.status === "ready")
    .map((service) => service.name);

  const runtimeState = await readStackRuntimeState(workspace.id);
  await workspaceRegistry.resolve(workspace.host).stopStack(workspace, {
    names: targetNames,
    processIds: targetNames.flatMap((name) => {
      const service = runtimeState.services[name];
      return service?.runtime === "process" && service.pid !== null ? [service.pid] : [];
    }),
  });
  await clearStackRuntimeServices(workspace.id, targetNames);

  for (const name of runningNames) {
    broadcastMessage({
      type: "service.stopped",
      workspace_id: workspace.id,
      service: name,
    });
  }

  return {
    stack: await listWorkspaceStack(db, workspaceRegistry, workspace.id),
    stoppedServices: runningNames,
    workspaceId: workspace.id,
  };
}
