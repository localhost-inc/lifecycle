import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveLifecycleRuntimePath } from "./runtime-paths";

export interface BridgeRegistration {
  pid: number;
  port: number;
  repoRoot?: string | null;
  dev?: boolean;
  startedAt?: string;
  supervisorPid?: number | null;
}

function dedupePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function defaultRuntimeRegistrationEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...environment };
  delete next.LIFECYCLE_BRIDGE_REGISTRATION;
  delete next.LIFECYCLE_RUNTIME_ROOT;
  return next;
}

export function bridgeRegistrationPath(environment: NodeJS.ProcessEnv = process.env): string {
  const explicitPath = environment.LIFECYCLE_BRIDGE_REGISTRATION?.trim();
  if (explicitPath) {
    return explicitPath;
  }
  return resolveLifecycleRuntimePath(["bridge.json"], environment);
}

export function bridgeRegistrationLookupPaths(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  return dedupePaths([
    bridgeRegistrationPath(environment),
    bridgeRegistrationPath(defaultRuntimeRegistrationEnvironment(environment)),
  ]);
}

export async function readBridgeRegistrationAtPath(
  path: string,
): Promise<BridgeRegistration | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as BridgeRegistration;
  } catch {
    return null;
  }
}

export async function readBridgeRegistration(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<BridgeRegistration | null> {
  return await readBridgeRegistrationAtPath(bridgeRegistrationPath(environment));
}

export async function writeBridgeRegistration(
  entry: BridgeRegistration,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = bridgeRegistrationPath(environment);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(entry) + "\n", "utf8");
}

export async function removeBridgeRegistrationAtPath(path: string): Promise<void> {
  try {
    await rm(path);
  } catch {
    // already gone
  }
}

export async function removeBridgeRegistration(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await removeBridgeRegistrationAtPath(bridgeRegistrationPath(environment));
}
