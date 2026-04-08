import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export function resolveLifecycleRootPath(environment: NodeJS.ProcessEnv = process.env): string {
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

export function resolveLifecyclePath(
  segments: string[],
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveLifecycleRootPath(environment), ...segments);
}

export function resolveLifecycleDbPath(environment: NodeJS.ProcessEnv = process.env): string {
  return resolveLifecyclePath(["lifecycle.db"], environment);
}
