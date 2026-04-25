import { stat } from "node:fs/promises";
import path from "node:path";

import {
  checkManagedDocumentTarget,
  installManagedDocumentTarget,
  resolveManagedDocumentTargets,
  type ManagedDocumentCheckStatus,
  type ManagedDocumentId,
  type ManagedDocumentInstallStatus,
  type ManagedDocumentScope,
  type ManagedDocumentTarget,
} from "../../../integrations/managed-docs";
import {
  listRepoInstallProviders,
  runRepoInstall,
  type RepoInstallProviderId,
  type RepoInstallResult,
} from "../../../integrations/repo-install";
import { BridgeError } from "../../lib/errors";
import { installProxyCleanHttp, proxyInstallStatus } from "../stack/install-proxy";

export type InstallStepId = "proxy" | RepoInstallProviderId | ManagedDocumentId;
export type InstallStepScope = "machine" | "repository" | "user";
export type InstallInspectStatus = "installed" | "missing" | "outdated" | "unsupported";
export type InstallApplyStatus = "applied" | "unchanged" | "requires_elevation" | "unsupported";

export interface InstallInspectTarget {
  harness_id: string;
  integration: string;
  label: string;
  path: string | null;
  status: string;
}

export interface InstallInspectStep {
  detail: string | null;
  id: InstallStepId;
  label: string;
  path: string | null;
  requires_elevation: boolean;
  scope: InstallStepScope;
  selected_by_default: boolean;
  status: InstallInspectStatus;
  targets: InstallInspectTarget[];
}

export interface InstallInspection {
  document_scope: ManagedDocumentScope;
  ready: boolean;
  repo_path: string | null;
  steps: InstallInspectStep[];
}

export interface InstallApplyTarget {
  harness_id: string;
  integration: string;
  label: string;
  path: string | null;
  status: string;
}

export interface InstallApplyStep {
  actions: string[];
  detail: string | null;
  id: InstallStepId;
  label: string;
  path: string | null;
  scope: InstallStepScope;
  status: InstallApplyStatus;
  targets: InstallApplyTarget[];
}

export interface InstallApplyResult {
  document_scope: ManagedDocumentScope;
  ready: boolean;
  repo_path: string | null;
  steps: InstallApplyStep[];
}

export interface InstallRuntimeOptions {
  environment?: NodeJS.ProcessEnv;
  homeDir?: string;
  isRoot?: boolean;
  platform?: NodeJS.Platform;
}

const INSTALL_STEP_ORDER: InstallStepId[] = [
  "proxy",
  "claude-code",
  "codex",
  "opencode",
  "agents-md",
  "claude-md",
];
const REPO_REQUIRED_MESSAGE =
  "Select a workspace or pass a repository path to configure repo-scoped Lifecycle files.";

function defaultIsRoot(): boolean {
  return process.getuid?.() === 0;
}

async function resolveRepoPath(repoPath?: string): Promise<string | null> {
  if (!repoPath) {
    return null;
  }

  const absolute = path.resolve(repoPath);
  const candidate = await stat(absolute).catch(() => null);
  if (!candidate?.isDirectory()) {
    throw new BridgeError({
      code: "repository_not_found",
      message: `Lifecycle could not find a repository directory at ${absolute}.`,
      status: 422,
    });
  }

  return absolute;
}

function isReady(status: InstallInspectStatus): boolean {
  return status === "installed" || status === "unsupported";
}

function selectedByDefault(status: InstallInspectStatus): boolean {
  return status !== "installed" && status !== "unsupported";
}

function managedDocumentTargetOptions(options: {
  homeDir?: string;
  projectPath?: string;
  scope: ManagedDocumentScope;
}): {
  homeDir?: string;
  projectPath?: string;
  scope: ManagedDocumentScope;
} {
  return {
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    ...(options.projectPath ? { projectPath: options.projectPath } : {}),
    scope: options.scope,
  };
}

function proxyStatusOptions(runtime?: InstallRuntimeOptions): {
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
} {
  return {
    ...(runtime?.environment ? { environment: runtime.environment } : {}),
    ...(runtime?.platform ? { platform: runtime.platform } : {}),
  };
}

function aggregateRepoCheckStatus(
  results: RepoInstallResult[],
): Extract<InstallInspectStatus, "installed" | "missing" | "outdated"> {
  if (results.every((result) => result.status === "installed")) {
    return "installed";
  }

  if (results.some((result) => result.status === "outdated")) {
    return "outdated";
  }

  return "missing";
}

function aggregateRepoApplyStatus(
  results: RepoInstallResult[],
): Extract<InstallApplyStatus, "applied" | "unchanged"> {
  return results.some((result) => result.status !== "unchanged") ? "applied" : "unchanged";
}

function providerLabel(providerId: RepoInstallProviderId): string {
  return (
    listRepoInstallProviders().find((provider) => provider.id === providerId)?.label ?? providerId
  );
}

function providerInspectStep(
  providerId: RepoInstallProviderId,
  repoPath: string | null,
): InstallInspectStep {
  const label = providerLabel(providerId);
  if (!repoPath) {
    return {
      detail: REPO_REQUIRED_MESSAGE,
      id: providerId,
      label,
      path: null,
      requires_elevation: false,
      scope: "repository",
      selected_by_default: false,
      status: "unsupported",
      targets: [],
    };
  }

  const results = runRepoInstall({
    check: true,
    providerIds: [providerId],
    repoPath,
  });
  const status = aggregateRepoCheckStatus(results);
  return {
    detail: `${results.length} managed target${results.length === 1 ? "" : "s"}`,
    id: providerId,
    label,
    path: repoPath,
    requires_elevation: false,
    scope: "repository",
    selected_by_default: selectedByDefault(status),
    status,
    targets: results.map((result) => ({
      harness_id: result.harness_id,
      integration: result.integration,
      label: result.label,
      path: result.path,
      status: result.status,
    })),
  };
}

function providerApplyStep(
  providerId: RepoInstallProviderId,
  repoPath: string | null,
): InstallApplyStep {
  const label = providerLabel(providerId);
  if (!repoPath) {
    return {
      actions: [],
      detail: REPO_REQUIRED_MESSAGE,
      id: providerId,
      label,
      path: null,
      scope: "repository",
      status: "unsupported",
      targets: [],
    };
  }

  const results = runRepoInstall({
    check: false,
    providerIds: [providerId],
    repoPath,
  });
  return {
    actions: [],
    detail: `${results.length} managed target${results.length === 1 ? "" : "s"}`,
    id: providerId,
    label,
    path: repoPath,
    scope: "repository",
    status: aggregateRepoApplyStatus(results),
    targets: results.map((result) => ({
      harness_id: result.harness_id,
      integration: result.integration,
      label: result.label,
      path: result.path,
      status: result.status,
    })),
  };
}

function managedDocumentTarget(options: {
  homeDir?: string;
  id: ManagedDocumentId;
  repoPath: string | null;
  scope: ManagedDocumentScope;
}): ManagedDocumentTarget {
  const target = resolveManagedDocumentTargets(
    managedDocumentTargetOptions({
      ...(options.homeDir ? { homeDir: options.homeDir } : {}),
      ...(options.repoPath ? { projectPath: options.repoPath } : {}),
      scope: options.scope,
    }),
  ).find((candidate) => candidate.id === options.id);
  if (!target) {
    throw new Error(`Unknown managed document target: ${options.id}`);
  }
  return target;
}

function normalizeManagedDocumentStatus(
  status: ManagedDocumentCheckStatus,
): Extract<InstallInspectStatus, "installed" | "missing" | "outdated"> {
  return status;
}

function managedDocumentInspectStep(
  id: ManagedDocumentId,
  options: { homeDir?: string; repoPath: string | null; scope: ManagedDocumentScope },
): InstallInspectStep {
  const label = id === "agents-md" ? "AGENTS.md managed block" : "CLAUDE.md managed block";
  if (options.scope === "project" && !options.repoPath) {
    return {
      detail: REPO_REQUIRED_MESSAGE,
      id,
      label,
      path: null,
      requires_elevation: false,
      scope: "repository",
      selected_by_default: false,
      status: "unsupported",
      targets: [],
    };
  }

  const target = managedDocumentTarget({
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    id,
    repoPath: options.repoPath,
    scope: options.scope,
  });
  const status = normalizeManagedDocumentStatus(checkManagedDocumentTarget(target));
  return {
    detail:
      options.scope === "user"
        ? "Lifecycle bridge-first guidance block for your user account"
        : "Lifecycle bridge-first guidance block for this repository",
    id,
    label,
    path: target.path,
    requires_elevation: false,
    scope: options.scope === "user" ? "user" : "repository",
    selected_by_default: selectedByDefault(status),
    status,
    targets: [
      {
        harness_id: "lifecycle",
        integration: "managed-doc",
        label: target.label,
        path: target.path,
        status,
      },
    ],
  };
}

function normalizeManagedDocumentApplyStatus(
  status: ManagedDocumentInstallStatus,
): Extract<InstallApplyStatus, "applied" | "unchanged"> {
  return status === "unchanged" ? "unchanged" : "applied";
}

function managedDocumentApplyStep(
  id: ManagedDocumentId,
  options: { homeDir?: string; repoPath: string | null; scope: ManagedDocumentScope },
): InstallApplyStep {
  const label = id === "agents-md" ? "AGENTS.md managed block" : "CLAUDE.md managed block";
  if (options.scope === "project" && !options.repoPath) {
    return {
      actions: [],
      detail: REPO_REQUIRED_MESSAGE,
      id,
      label,
      path: null,
      scope: "repository",
      status: "unsupported",
      targets: [],
    };
  }

  const target = managedDocumentTarget({
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    id,
    repoPath: options.repoPath,
    scope: options.scope,
  });
  const status = installManagedDocumentTarget(target);
  return {
    actions: [],
    detail:
      options.scope === "user"
        ? "Lifecycle bridge-first guidance block for your user account"
        : "Lifecycle bridge-first guidance block for this repository",
    id,
    label,
    path: target.path,
    scope: options.scope === "user" ? "user" : "repository",
    status: normalizeManagedDocumentApplyStatus(status),
    targets: [
      {
        harness_id: "lifecycle",
        integration: "managed-doc",
        label: target.label,
        path: target.path,
        status,
      },
    ],
  };
}

async function proxyInspectStep(runtime?: InstallRuntimeOptions): Promise<InstallInspectStep> {
  const status = await proxyInstallStatus(proxyStatusOptions(runtime));
  if (!status.currentPlatformSupported) {
    return {
      detail: `Unsupported platform: ${status.platform}`,
      id: "proxy",
      label: "Local preview proxy",
      path: null,
      requires_elevation: false,
      scope: "machine",
      selected_by_default: false,
      status: "unsupported",
      targets: [],
    };
  }

  const installed = status.installed ? "installed" : "missing";
  const requiresElevation = !status.installed && !(runtime?.isRoot ?? defaultIsRoot());
  return {
    detail: `Routes http://*.lifecycle.localhost/ to the Lifecycle bridge on ${status.proxyPort}`,
    id: "proxy",
    label: "Local preview proxy",
    path: null,
    requires_elevation: requiresElevation,
    scope: "machine",
    selected_by_default: selectedByDefault(installed),
    status: installed,
    targets: [],
  };
}

async function proxyApplyStep(runtime?: InstallRuntimeOptions): Promise<InstallApplyStep> {
  const status = await proxyInstallStatus(proxyStatusOptions(runtime));
  if (!status.currentPlatformSupported) {
    return {
      actions: [],
      detail: `Unsupported platform: ${status.platform}`,
      id: "proxy",
      label: "Local preview proxy",
      path: null,
      scope: "machine",
      status: "unsupported",
      targets: [],
    };
  }

  if (!(runtime?.isRoot ?? defaultIsRoot())) {
    return {
      actions: [],
      detail: "Run `sudo lifecycle proxy install` to finish local preview routing.",
      id: "proxy",
      label: "Local preview proxy",
      path: null,
      scope: "machine",
      status: "requires_elevation",
      targets: [],
    };
  }

  const actions = await installProxyCleanHttp(proxyStatusOptions(runtime));
  return {
    actions,
    detail: `Routes http://*.lifecycle.localhost/ to the Lifecycle bridge on ${status.proxyPort}`,
    id: "proxy",
    label: "Local preview proxy",
    path: null,
    scope: "machine",
    status: "applied",
    targets: [],
  };
}

function orderedUniqueStepIds(stepIds: InstallStepId[]): InstallStepId[] {
  const selected = new Set(stepIds);
  return INSTALL_STEP_ORDER.filter((stepId) => selected.has(stepId));
}

async function inspectStep(
  stepId: InstallStepId,
  repoPath: string | null,
  documentScope: ManagedDocumentScope,
  runtime?: InstallRuntimeOptions,
): Promise<InstallInspectStep> {
  switch (stepId) {
    case "proxy":
      return proxyInspectStep(runtime);
    case "claude-code":
    case "codex":
    case "opencode":
      return providerInspectStep(stepId, repoPath);
    case "agents-md":
    case "claude-md":
      return managedDocumentInspectStep(stepId, {
        ...(runtime?.homeDir ? { homeDir: runtime.homeDir } : {}),
        repoPath,
        scope: documentScope,
      });
  }
}

async function applyStep(
  stepId: InstallStepId,
  repoPath: string | null,
  documentScope: ManagedDocumentScope,
  runtime?: InstallRuntimeOptions,
): Promise<InstallApplyStep> {
  switch (stepId) {
    case "proxy":
      return proxyApplyStep(runtime);
    case "claude-code":
    case "codex":
    case "opencode":
      return providerApplyStep(stepId, repoPath);
    case "agents-md":
    case "claude-md":
      return managedDocumentApplyStep(stepId, {
        ...(runtime?.homeDir ? { homeDir: runtime.homeDir } : {}),
        repoPath,
        scope: documentScope,
      });
  }
}

export async function inspectLifecycleInstall(
  input: { documentScope?: ManagedDocumentScope; repoPath?: string },
  runtime?: InstallRuntimeOptions,
): Promise<InstallInspection> {
  const documentScope = input.documentScope ?? "project";
  const repoPath = await resolveRepoPath(input.repoPath);
  const steps = await Promise.all(
    INSTALL_STEP_ORDER.map(
      async (stepId) => await inspectStep(stepId, repoPath, documentScope, runtime),
    ),
  );
  return {
    document_scope: documentScope,
    ready: steps.every((step) => isReady(step.status)),
    repo_path: repoPath,
    steps,
  };
}

export async function applyLifecycleInstall(
  input: { documentScope?: ManagedDocumentScope; repoPath?: string; stepIds: InstallStepId[] },
  runtime?: InstallRuntimeOptions,
): Promise<InstallApplyResult> {
  const documentScope = input.documentScope ?? "project";
  const repoPath = await resolveRepoPath(input.repoPath);
  const stepIds = orderedUniqueStepIds(input.stepIds);
  const steps = await Promise.all(
    stepIds.map(async (stepId) => await applyStep(stepId, repoPath, documentScope, runtime)),
  );
  const inspection = await inspectLifecycleInstall(
    {
      documentScope,
      ...(repoPath ? { repoPath } : {}),
    },
    runtime,
  );
  return {
    document_scope: documentScope,
    ready: inspection.ready,
    repo_path: repoPath,
    steps,
  };
}
