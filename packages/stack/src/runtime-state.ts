import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { ServiceStatus, ServiceStatusReason } from "@lifecycle/contracts";

export interface StackRuntimeServiceRecord {
  name: string;
  runtime: "process" | "image";
  status: ServiceStatus;
  status_reason: ServiceStatusReason | null;
  assigned_port: number | null;
  pid: number | null;
  created_at: string;
  updated_at: string;
}

export interface StackRuntimeState {
  services: Record<string, StackRuntimeServiceRecord>;
  stack_id: string;
}

function resolveLifecycleRootPath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.LIFECYCLE_ROOT?.trim();
  if (!configured) {
    return join(homedir(), ".lifecycle");
  }

  if (configured === "~") {
    return homedir();
  }

  if (configured.startsWith("~/")) {
    return join(homedir(), configured.slice(2));
  }

  if (!isAbsolute(configured)) {
    throw new Error(`LIFECYCLE_ROOT must be an absolute path or start with ~/: ${configured}`);
  }

  return configured;
}

export function stackRuntimeStatePath(
  stackId: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveLifecycleRootPath(environment), "stack-runtime", `${stackId}.json`);
}

export async function readStackRuntimeState(
  stackId: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<StackRuntimeState> {
  const path = stackRuntimeStatePath(stackId, environment);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<StackRuntimeState>;
    return {
      services: parsed.services ?? {},
      stack_id: typeof parsed.stack_id === "string" ? parsed.stack_id : stackId,
    };
  } catch {
    return {
      services: {},
      stack_id: stackId,
    };
  }
}

export async function writeStackRuntimeState(
  state: StackRuntimeState,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = stackRuntimeStatePath(state.stack_id, environment);
  await mkdir(dirname(path), { recursive: true });

  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await rename(tempPath, path);
}

export async function upsertStackRuntimeService(
  stackId: string,
  service: StackRuntimeServiceRecord,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const state = await readStackRuntimeState(stackId, environment);
  state.services[service.name] = service;
  await writeStackRuntimeState(state, environment);
}

export async function clearStackRuntimeServices(
  stackId: string,
  names?: string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const state = await readStackRuntimeState(stackId, environment);

  if (!names || names.length === 0) {
    await rm(stackRuntimeStatePath(stackId, environment), { force: true });
    return;
  }

  for (const name of names) {
    delete state.services[name];
  }

  if (Object.keys(state.services).length === 0) {
    await rm(stackRuntimeStatePath(stackId, environment), { force: true });
    return;
  }

  await writeStackRuntimeState(state, environment);
}
