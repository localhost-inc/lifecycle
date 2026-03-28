import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { slugifyWorkspaceName } from "../policy/workspace-names";
import { previewUrlForService } from "../runtime";

export function uppercaseWorkspaceEnvKey(value: string): string {
  let result = "";
  let lastWasSeparator = false;

  for (const char of value) {
    if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toUpperCase();
      lastWasSeparator = false;
      continue;
    }

    if (!lastWasSeparator) {
      result += "_";
      lastWasSeparator = true;
    }
  }

  return result.replace(/^_+|_+$/g, "");
}

export function injectAssignedPortsIntoManifest(
  config: LifecycleConfig,
  assignedPorts: Record<string, number>,
): LifecycleConfig {
  const nextEnvironment = Object.fromEntries(
    Object.entries(config.environment).map(([name, node]) => {
      const assignedPort = assignedPorts[name];
      if (assignedPort === undefined || node.kind !== "service") {
        return [name, node];
      }

      if (node.runtime === "process") {
        return [
          name,
          {
            ...node,
            env: {
              ...(node.env ?? {}),
              PORT: String(assignedPort),
            },
          },
        ];
      }

      return [name, node];
    }),
  );

  return {
    ...config,
    environment: nextEnvironment,
  };
}

export function buildWorkspaceRuntimeEnv(input: {
  previewProxyPort: number;
  services: Pick<ServiceRecord, "assigned_port" | "name">[];
  workspace: Pick<WorkspaceRecord, "checkout_type" | "id" | "name" | "source_ref">;
  worktreePath: string;
}): Record<string, string> {
  const env: Record<string, string> = {
    LIFECYCLE_WORKSPACE_ID: input.workspace.id,
    LIFECYCLE_WORKSPACE_NAME: input.workspace.name,
    LIFECYCLE_WORKSPACE_PATH: input.worktreePath,
    LIFECYCLE_WORKSPACE_SLUG: slugifyWorkspaceName(input.workspace.name),
    LIFECYCLE_WORKSPACE_SOURCE_REF: input.workspace.source_ref,
  };

  for (const service of input.services) {
    const key = uppercaseWorkspaceEnvKey(service.name);
    if (!key) {
      continue;
    }

    env[`LIFECYCLE_SERVICE_${key}_HOST`] = "127.0.0.1";

    if (service.assigned_port === null) {
      continue;
    }

    env[`LIFECYCLE_SERVICE_${key}_PORT`] = String(service.assigned_port);
    env[`LIFECYCLE_SERVICE_${key}_ADDRESS`] = `127.0.0.1:${service.assigned_port}`;
    env[`LIFECYCLE_SERVICE_${key}_URL`] = previewUrlForService(
      input.workspace,
      service.name,
      input.previewProxyPort,
    );
  }

  return env;
}

/**
 * Expand `${LIFECYCLE_*}` templates in a string using the provided runtime env.
 * Non-`LIFECYCLE_` templates are left untouched so external env vars pass through.
 * Throws if a `LIFECYCLE_*` variable is referenced but not present in `env`.
 */
export function expandRuntimeTemplates(
  input: string,
  env: Record<string, string>,
  field?: string,
): string {
  let output = "";
  let rest = input;

  while (true) {
    const start = rest.indexOf("${");
    if (start === -1) {
      break;
    }

    output += rest.slice(0, start);
    const afterStart = rest.slice(start + 2);
    const end = afterStart.indexOf("}");
    if (end === -1) {
      throw new Error(`Unterminated template in '${input}'${field ? ` (${field})` : ""}`);
    }

    const key = afterStart.slice(0, end);
    if (key.startsWith("LIFECYCLE_")) {
      const value = env[key];
      if (value === undefined) {
        throw new Error(`Unknown runtime variable '${key}'${field ? ` in ${field}` : ""}`);
      }
      output += value;
    } else {
      output += `\${${key}}`;
    }

    rest = afterStart.slice(end + 1);
  }

  output += rest;
  return output;
}

/**
 * Resolve a service's env block by expanding `${LIFECYCLE_*}` templates,
 * then merging in the full runtime env and color-forcing vars.
 */
export function resolveServiceEnv(
  serviceEnv: Record<string, string> | undefined,
  runtimeEnv: Record<string, string>,
  field?: string,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  if (serviceEnv) {
    for (const [key, value] of Object.entries(serviceEnv)) {
      resolved[key] = expandRuntimeTemplates(value, runtimeEnv, field ? `${field}.${key}` : key);
    }
  }

  // Merge runtime env (service-specific values take precedence).
  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (!(key in resolved)) {
      resolved[key] = value;
    }
  }

  // Force color output for service processes.
  resolved.FORCE_COLOR = "1";
  resolved.CLICOLOR_FORCE = "1";

  return resolved;
}
