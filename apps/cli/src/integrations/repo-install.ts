import type { HookCheckStatus, HookInstallStatus, ResolvedHookTarget } from "./hooks";
import { checkHookTarget, installHookTarget, resolveHookTargets } from "./hooks";
import type { McpCheckStatus, McpInstallStatus, ResolvedMcpTarget } from "./mcp";
import { checkMcpTarget, installMcpTarget, resolveMcpTargets } from "./mcp";

export type RepoInstallProviderId = "claude-code" | "codex";

export interface RepoInstallResult {
  harness_id: string;
  integration: string;
  label: string;
  path: string;
  provider_id: RepoInstallProviderId | "shared";
  scope: string;
  status: McpCheckStatus | HookCheckStatus | McpInstallStatus | HookInstallStatus;
}

interface ProviderTarget {
  harness_id: string;
  integration: string;
  label: string;
  path: string;
  provider_id: RepoInstallProviderId | "shared";
  runCheck: () => McpCheckStatus | HookCheckStatus;
  runInstall: () => McpInstallStatus | HookInstallStatus;
  scope: string;
}

export interface RepoInstallProviderOption {
  description: string;
  id: RepoInstallProviderId;
  label: string;
}

const PROVIDER_OPTIONS: readonly RepoInstallProviderOption[] = [
  {
    description: "Install project-scoped MCP config and Claude Code hooks.",
    id: "claude-code",
    label: "Claude Code",
  },
  {
    description: "Install project-scoped MCP config and Codex hooks.",
    id: "codex",
    label: "Codex",
  },
] as const;

const PROVIDER_ORDER = new Map<RepoInstallProviderId, number>(
  PROVIDER_OPTIONS.map((provider, index) => [provider.id, index]),
);

export function listRepoInstallProviders(): readonly RepoInstallProviderOption[] {
  return PROVIDER_OPTIONS;
}

export function resolveRepoInstallTargets(repoPath: string): ProviderTarget[] {
  const mcpTargets = resolveMcpTargets("project", repoPath);
  const hookTargets = resolveHookTargets(repoPath);
  const lifecycleHookAdapter =
    hookTargets.find((target) => target.integration === "hook-adapter") ?? null;
  const providerTargets: ProviderTarget[] = [];

  for (const provider of PROVIDER_OPTIONS) {
    if (lifecycleHookAdapter) {
      providerTargets.push(createHookTarget("shared", lifecycleHookAdapter));
    }

    const providerHookTargets = hookTargets.filter(
      (target) => target.harness_id === provider.id && target.integration !== "hook-adapter",
    );
    for (const target of providerHookTargets) {
      providerTargets.push(createHookTarget(provider.id, target));
    }

    const providerMcpTargets = mcpTargets.filter((target) => target.harness_id === provider.id);
    for (const target of providerMcpTargets) {
      providerTargets.push(createMcpTarget(provider.id, target));
    }
  }

  return providerTargets;
}

export function runRepoInstall(options: {
  check: boolean;
  providerIds: RepoInstallProviderId[];
  repoPath: string;
}): RepoInstallResult[] {
  const uniqueProviderIds = [...new Set(options.providerIds)].sort(compareProviderIds);
  const selected = new Set<RepoInstallProviderId>(uniqueProviderIds);
  const targets = resolveRepoInstallTargets(options.repoPath);
  const sharedResults = new Map<string, RepoInstallResult>();
  const results: RepoInstallResult[] = [];

  for (const target of targets) {
    if (target.provider_id === "shared") {
      if (uniqueProviderIds.length === 0) {
        continue;
      }
      const sharedKey = `${target.integration}:${target.path}`;
      if (sharedResults.has(sharedKey)) {
        continue;
      }
      const result = buildResult(target, options.check);
      sharedResults.set(sharedKey, result);
      results.push(result);
      continue;
    }

    if (!selected.has(target.provider_id)) {
      continue;
    }
    results.push(buildResult(target, options.check));
  }

  return results;
}

function compareProviderIds(left: RepoInstallProviderId, right: RepoInstallProviderId): number {
  return (PROVIDER_ORDER.get(left) ?? 0) - (PROVIDER_ORDER.get(right) ?? 0);
}

function createHookTarget(
  providerId: RepoInstallProviderId | "shared",
  target: ResolvedHookTarget,
): ProviderTarget {
  return {
    harness_id: target.harness_id,
    integration: target.integration,
    label: target.label,
    path: target.path,
    provider_id: providerId,
    runCheck: () => checkHookTarget(target),
    runInstall: () => installHookTarget(target),
    scope: target.scope,
  };
}

function createMcpTarget(
  providerId: RepoInstallProviderId,
  target: ResolvedMcpTarget,
): ProviderTarget {
  const entry = {
    args: ["mcp"],
    command: "lifecycle",
  };
  return {
    harness_id: target.harness_id,
    integration: "mcp",
    label: target.label,
    path: target.path,
    provider_id: providerId,
    runCheck: () => checkMcpTarget(target, entry),
    runInstall: () => installMcpTarget(target, entry),
    scope: target.scope,
  };
}

function buildResult(target: ProviderTarget, check: boolean): RepoInstallResult {
  return {
    harness_id: target.harness_id,
    integration: target.integration,
    label: target.label,
    path: target.path,
    provider_id: target.provider_id,
    scope: target.scope,
    status: check ? target.runCheck() : target.runInstall(),
  };
}
