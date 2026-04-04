import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import {
  listServiceRowsByWorkspace,
  serviceRecordFromRow,
  upsertServiceRow,
  type ServiceRow,
} from "@lifecycle/db/queries";
import {
  createStartStackInput,
  declaredServiceNames,
  isPidAlive,
  slugify,
  type StackClientRegistry,
} from "@lifecycle/stack";
import { LocalStackClient } from "@lifecycle/stack/internal/local";
import type { WorkspaceClientRegistry } from "@lifecycle/workspace";

import { BridgeError } from "./errors";
import { broadcastMessage } from "./server";
import { resolveBridgeWorkspaceRecord } from "./workspaces";

function requireWorkspacePath(workspace: WorkspaceRecord): string {
  if (!workspace.worktree_path) {
    throw new Error(`Workspace "${workspace.id}" has no worktree path.`);
  }
  return workspace.worktree_path;
}

async function readDeclaredServiceNames(
  workspaceRegistry: WorkspaceClientRegistry,
  workspace: WorkspaceRecord,
): Promise<string[]> {
  const manifest = await workspaceRegistry.resolve(workspace.host).readManifest(requireWorkspacePath(workspace));
  if (manifest.state === "missing") {
    return [];
  }
  if (manifest.state === "invalid") {
    const message = manifest.result.errors[0]?.message ?? "Manifest is invalid.";
    throw new Error(message);
  }
  return declaredServiceNames(manifest.result.config);
}

async function syncServiceRows(
  db: SqlDriver,
  workspace: WorkspaceRecord,
  serviceNames: string[],
): Promise<ServiceRow[]> {
  const existingRows = await listServiceRowsByWorkspace(db, workspace.id);
  const existingByName = new Map(existingRows.map((row) => [row.name, row]));
  const now = new Date().toISOString();

  for (const name of serviceNames) {
    const existing = existingByName.get(name);
    if (existing) {
      continue;
    }

    const row: ServiceRow = {
      id: `${workspace.id}:${name}`,
      workspace_id: workspace.id,
      name,
      status: "stopped",
      status_reason: null,
      assigned_port: null,
      pid: null,
      created_at: now,
      updated_at: now,
    };
    await upsertServiceRow(db, row);
    existingByName.set(name, row);
  }

  return serviceNames
    .map((name) => existingByName.get(name))
    .filter((row): row is ServiceRow => row !== undefined);
}

async function refreshRuntimeRows(
  db: SqlDriver,
  rows: ServiceRow[],
): Promise<ServiceRow[]> {
  const nextRows: ServiceRow[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    if (row.pid !== null && !isPidAlive(row.pid)) {
      const stoppedRow: ServiceRow = {
        ...row,
        status: "stopped",
        status_reason: row.status === "failed" ? row.status_reason : null,
        assigned_port: null,
        pid: null,
        updated_at: now,
      };
      await upsertServiceRow(db, stoppedRow);
      nextRows.push(stoppedRow);
      continue;
    }

    nextRows.push(row);
  }

  return nextRows;
}

async function listRuntimeServiceRecords(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspace: WorkspaceRecord,
): Promise<ServiceRecord[]> {
  const serviceNames = await readDeclaredServiceNames(workspaceRegistry, workspace);
  const rows = await syncServiceRows(db, workspace, serviceNames);
  const refreshedRows = await refreshRuntimeRows(db, rows);
  return refreshedRows.map(serviceRecordFromRow);
}

function localSupervisorForHost(
  stackRegistry: StackClientRegistry,
  workspace: WorkspaceRecord,
) {
  const client = stackRegistry.resolve(workspace.host);
  if (!(client instanceof LocalStackClient)) {
    throw new Error(`Stack runtime for host "${workspace.host}" is not available in the local bridge.`);
  }
  return client;
}

export async function listBridgeServices(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  workspaceId: string,
): Promise<ServiceRecord[]> {
  const workspace = await resolveBridgeWorkspaceRecord(db, workspaceId);
  return listRuntimeServiceRecords(db, workspaceRegistry, workspace);
}

export async function startBridgeServices(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  stackRegistry: StackClientRegistry,
  workspaceId: string,
  serviceNames?: string[],
): Promise<{ services: ServiceRecord[]; startedServices: string[]; workspaceId: string }> {
  const workspace = await resolveBridgeWorkspaceRecord(db, workspaceId);
  const manifest = await workspaceRegistry.resolve(workspace.host).readManifest(requireWorkspacePath(workspace));
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
      message: manifest.result.errors[0]?.message ?? "Workspace manifest is invalid.",
      status: 400,
    });
  }

  const declared = declaredServiceNames(manifest.result.config);
  const syncedRows = await syncServiceRows(db, workspace, declared);
  const currentServices = (await refreshRuntimeRows(db, syncedRows)).map(serviceRecordFromRow);
  const stackClient = localSupervisorForHost(stackRegistry, workspace);
  const rowByName = new Map(syncedRows.map((row) => [row.name, row]));
  const runtimeWrites: Promise<void>[] = [];

  const queueRowWrite = (row: ServiceRow) => {
    runtimeWrites.push(upsertServiceRow(db, row));
  };

  const baseInput = createStartStackInput({
    hostLabel: slugify(workspace.name),
    ...(serviceNames && serviceNames.length > 0 ? { serviceNames } : {}),
    services: currentServices,
    workspace,
  });

  try {
    const result = await stackClient.start(manifest.result.config, {
      ...baseInput,
      callbacks: {
        onServiceStarting: (name) => {
          const existing = rowByName.get(name);
          if (!existing) {
            return;
          }
          const nextRow: ServiceRow = {
            ...existing,
            status: "starting",
            status_reason: null,
            updated_at: new Date().toISOString(),
          };
          rowByName.set(name, nextRow);
          queueRowWrite(nextRow);
        },
        onServiceReady: (service) => {
          const existing = rowByName.get(service.name);
          if (!existing) {
            return;
          }
          const nextRow: ServiceRow = {
            ...existing,
            status: "ready",
            status_reason: null,
            assigned_port: service.assignedPort,
            pid: stackClient.getSupervisor().pid(`${workspace.id}:${service.name}`),
            updated_at: new Date().toISOString(),
          };
          rowByName.set(service.name, nextRow);
          queueRowWrite(nextRow);
          broadcastMessage({
            type: "service.started",
            workspace_id: workspace.id,
            service: service.name,
          });
        },
        onServiceFailed: (name) => {
          const existing = rowByName.get(name);
          if (!existing) {
            return;
          }
          const nextRow: ServiceRow = {
            ...existing,
            status: "failed",
            status_reason: "service_start_failed",
            assigned_port: null,
            pid: null,
            updated_at: new Date().toISOString(),
          };
          rowByName.set(name, nextRow);
          queueRowWrite(nextRow);
          broadcastMessage({
            type: "service.failed",
            workspace_id: workspace.id,
            service: name,
            error: "Service failed to start.",
          });
        },
      },
    });

    await Promise.all(runtimeWrites);

    return {
      services: await listRuntimeServiceRecords(db, workspaceRegistry, workspace),
      startedServices: result.startedServices.map((service) => service.name),
      workspaceId: workspace.id,
    };
  } catch (error) {
    await Promise.all(runtimeWrites);
    throw error;
  }
}

export async function stopBridgeServices(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  stackRegistry: StackClientRegistry,
  workspaceId: string,
  serviceNames?: string[],
): Promise<{ services: ServiceRecord[]; stoppedServices: string[]; workspaceId: string }> {
  const workspace = await resolveBridgeWorkspaceRecord(db, workspaceId);
  const currentRows = await listServiceRowsByWorkspace(db, workspace.id);
  const declared = await readDeclaredServiceNames(workspaceRegistry, workspace);
  const syncedRows = await syncServiceRows(db, workspace, declared);
  const targetNames = serviceNames && serviceNames.length > 0 ? serviceNames : syncedRows.map((row) => row.name);
  const runningNames = currentRows
    .filter((row) => targetNames.includes(row.name) && row.pid !== null && isPidAlive(row.pid))
    .map((row) => row.name);

  localSupervisorForHost(stackRegistry, workspace).stop(workspace.id, targetNames);

  const now = new Date().toISOString();
  for (const row of syncedRows) {
    if (!targetNames.includes(row.name)) {
      continue;
    }
    await upsertServiceRow(db, {
      ...row,
      status: "stopped",
      status_reason: null,
      assigned_port: null,
      pid: null,
      updated_at: now,
    });
  }

  for (const name of runningNames) {
    broadcastMessage({
      type: "service.stopped",
      workspace_id: workspace.id,
      service: name,
    });
  }

  return {
    services: await listRuntimeServiceRecords(db, workspaceRegistry, workspace),
    stoppedServices: runningNames,
    workspaceId: workspace.id,
  };
}
