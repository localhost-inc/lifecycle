import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { resolveLifecycleRootPath } from "@lifecycle/db/paths";

export function resolveLifecycleRuntimeRootPath(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment.LIFECYCLE_RUNTIME_ROOT?.trim();
  if (!configured) {
    return resolveLifecycleRootPath(environment);
  }

  if (configured === "~") {
    return homedir();
  }

  if (configured.startsWith("~/")) {
    return join(homedir(), configured.slice(2));
  }

  if (!isAbsolute(configured)) {
    throw new Error(
      `LIFECYCLE_RUNTIME_ROOT must be an absolute path or start with ~/: ${configured}`,
    );
  }

  return configured;
}

export function resolveLifecycleRuntimePath(
  segments: string[],
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveLifecycleRuntimeRootPath(environment), ...segments);
}
