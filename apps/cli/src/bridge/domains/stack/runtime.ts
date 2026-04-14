import type { LifecycleConfig, ServiceRecord } from "@lifecycle/contracts";

const PREVIEW_HOST_SUFFIX = ["lifecycle", "localhost"] as const;
export const DEFAULT_BRIDGE_PORT = 52300;

export function uppercaseEnvKey(value: string): string {
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

export function slugify(value: string): string {
  let slug = "";
  let previousDash = false;

  for (const ch of value) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      slug += ch.toLowerCase();
      previousDash = false;
    } else if (" -_/.".includes(ch)) {
      if (slug.length > 0 && !previousDash) {
        slug += "-";
        previousDash = true;
      }
    }
  }

  while (slug.endsWith("-")) {
    slug = slug.slice(0, -1);
  }

  return slug || "unnamed";
}

export function resolveBridgePort(environment: NodeJS.ProcessEnv = process.env): number {
  const configured = environment.LIFECYCLE_BRIDGE_PORT?.trim();
  if (!configured) {
    return DEFAULT_BRIDGE_PORT;
  }

  const parsed = Number.parseInt(configured, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`LIFECYCLE_BRIDGE_PORT must be a positive integer: ${configured}`);
  }

  return parsed;
}

export function previewHostnameForService(hostLabel: string, serviceName: string): string {
  const serviceLabel = slugify(serviceName);
  return [serviceLabel, hostLabel, ...PREVIEW_HOST_SUFFIX].join(".");
}

export function previewUrlForService(hostLabel: string, serviceName: string, port: number): string {
  return `http://${previewHostnameForService(hostLabel, serviceName)}:${port}`;
}

export function parsePreviewHost(host: string): { hostLabel: string; serviceLabel: string } | null {
  const normalized = host.trim().toLowerCase().replace(/:\d+$/, "");
  const suffix = `.${PREVIEW_HOST_SUFFIX.join(".")}`;
  if (!normalized.endsWith(suffix)) {
    return null;
  }

  const prefix = normalized.slice(0, -suffix.length);
  const [serviceLabel, ...hostParts] = prefix.split(".");
  if (!serviceLabel || hostParts.length === 0) {
    return null;
  }

  const hostLabel = hostParts.join(".");
  return hostLabel ? { hostLabel, serviceLabel } : null;
}

export function injectAssignedPortsIntoManifest(
  config: LifecycleConfig,
  assignedPorts: Record<string, number>,
): LifecycleConfig {
  if (!config.stack) {
    return config;
  }

  const nextNodes = Object.fromEntries(
    Object.entries(config.stack.nodes).map(([name, node]) => {
      const assignedPort = assignedPorts[name];
      if (assignedPort === undefined || node.kind !== "process") {
        return [name, node];
      }

      return [
        name,
        {
          ...node,
          env: {
            ...node.env,
            PORT: String(assignedPort),
          },
        },
      ];
    }),
  );

  return {
    ...config,
    stack: {
      ...config.stack,
      nodes: nextNodes,
    },
  };
}

export function buildStackEnv(input: {
  bridgePort: number;
  stackId: string;
  hostLabel: string;
  name: string;
  rootPath: string;
  services: Pick<ServiceRecord, "assigned_port" | "name">[];
  sourceRef: string;
}): Record<string, string> {
  const env: Record<string, string> = {
    LIFECYCLE_WORKSPACE_ID: input.stackId,
    LIFECYCLE_WORKSPACE_NAME: input.name,
    LIFECYCLE_WORKSPACE_PATH: input.rootPath,
    LIFECYCLE_WORKSPACE_SLUG: slugify(input.name),
    LIFECYCLE_WORKSPACE_SOURCE_REF: input.sourceRef,
  };

  for (const service of input.services) {
    const key = uppercaseEnvKey(service.name);
    if (!key) {
      continue;
    }

    env[`LIFECYCLE_SERVICE_${key}_HOST`] = "127.0.0.1";

    if (service.assigned_port === null) {
      continue;
    }

    env[`LIFECYCLE_SERVICE_${key}_PORT`] = String(service.assigned_port);
    env[`LIFECYCLE_SERVICE_${key}_ADDRESS`] = `127.0.0.1:${service.assigned_port}`;
    const previewPort = input.bridgePort > 0 ? input.bridgePort : service.assigned_port;
    env[`LIFECYCLE_SERVICE_${key}_URL`] = previewUrlForService(
      input.hostLabel,
      service.name,
      previewPort,
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

  // Inherit the host process environment so PATH and other system vars are
  // available to spawned services, then overlay lifecycle runtime vars.
  const base: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const [key, value] of Object.entries(runtimeEnv)) {
    base[key] = value;
  }
  for (const [key, value] of Object.entries(resolved)) {
    base[key] = value;
  }

  base.FORCE_COLOR = "1";
  base.CLICOLOR_FORCE = "1";

  return base;
}
