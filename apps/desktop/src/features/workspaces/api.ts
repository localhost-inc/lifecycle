import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  WorkspaceMode,
  WorkspaceStatus,
  WorkspaceFailureReason,
  WorkspaceServiceExposure,
  WorkspaceServicePreviewFailureReason,
  WorkspaceServicePreviewState,
  WorkspaceServiceStatus,
  WorkspaceServiceStatusReason,
} from "@lifecycle/contracts";

export interface WorkspaceRow {
  id: string;
  project_id: string;
  name: string;
  source_ref: string;
  git_sha: string | null;
  worktree_path: string | null;
  mode: WorkspaceMode;
  status: WorkspaceStatus;
  failure_reason: WorkspaceFailureReason | null;
  failed_at: string | null;
  created_by: string | null;
  source_workspace_id: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  expires_at: string | null;
}

export interface ServiceRow {
  id: string;
  workspace_id: string;
  service_name: string;
  exposure: WorkspaceServiceExposure;
  port_override: number | null;
  status: WorkspaceServiceStatus;
  status_reason: WorkspaceServiceStatusReason | null;
  default_port: number | null;
  effective_port: number | null;
  preview_state: WorkspaceServicePreviewState;
  preview_failure_reason: WorkspaceServicePreviewFailureReason | null;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceStatusEvent {
  workspace_id: string;
  status: WorkspaceStatus;
  failure_reason: WorkspaceFailureReason | null;
}

export interface ServiceStatusEvent {
  workspace_id: string;
  service_name: string;
  status: WorkspaceServiceStatus;
  status_reason: WorkspaceServiceStatusReason | null;
}

export interface SetupStepEvent {
  workspace_id: string;
  step_name: string;
  event_type: "started" | "stdout" | "stderr" | "completed" | "failed" | "timeout";
  data: string | null;
}

export interface WorkspaceRenamedEvent {
  workspace_id: string;
  name: string;
  worktree_path: string | null;
}

export type WorkspaceShortcutAction =
  | "close-active-tab"
  | "new-tab"
  | "next-tab"
  | "previous-tab"
  | "select-tab-index";

export interface WorkspaceShortcutEvent {
  action: WorkspaceShortcutAction;
  index: number | null;
  source_surface_id: string | null;
  source_surface_kind: "native-terminal" | null;
}

interface BrowserWorkspaceState {
  workspaces: BrowserWorkspaceRow[];
  services: ServiceRow[];
}

interface BrowserWorkspaceRow extends WorkspaceRow {
  name_origin?: "default" | "generated" | "manual";
}

interface BrowserEventListeners {
  workspaceStatus: Set<(event: WorkspaceStatusEvent) => void>;
  workspaceRenamed: Set<(event: WorkspaceRenamedEvent) => void>;
  serviceStatus: Set<(event: ServiceStatusEvent) => void>;
  setupProgress: Set<(event: SetupStepEvent) => void>;
}

const BROWSER_WORKSPACES_STORAGE_KEY = "lifecycle.desktop.browser.workspaces.v1";

let browserWorkspaceState = readBrowserWorkspaceState();

const browserListeners: BrowserEventListeners = {
  workspaceStatus: new Set(),
  workspaceRenamed: new Set(),
  serviceStatus: new Set(),
  setupProgress: new Set(),
};

function readBrowserWorkspaceState(): BrowserWorkspaceState {
  if (typeof window === "undefined") {
    return { workspaces: [], services: [] };
  }

  const raw = window.localStorage.getItem(BROWSER_WORKSPACES_STORAGE_KEY);
  if (!raw) {
    return { workspaces: [], services: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BrowserWorkspaceState>;
    return {
      workspaces: Array.isArray(parsed.workspaces)
        ? parsed.workspaces.map((workspace) => normalizeBrowserWorkspaceRow(workspace))
        : [],
      services: Array.isArray(parsed.services) ? parsed.services : [],
    };
  } catch {
    return { workspaces: [], services: [] };
  }
}

function persistBrowserWorkspaceState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    BROWSER_WORKSPACES_STORAGE_KEY,
    JSON.stringify(browserWorkspaceState),
  );
}

function emitWorkspaceStatus(event: WorkspaceStatusEvent): void {
  for (const callback of browserListeners.workspaceStatus) {
    callback(event);
  }
}

function emitWorkspaceRenamed(event: WorkspaceRenamedEvent): void {
  for (const callback of browserListeners.workspaceRenamed) {
    callback(event);
  }
}

function emitServiceStatus(event: ServiceStatusEvent): void {
  for (const callback of browserListeners.serviceStatus) {
    callback(event);
  }
}

function emitSetupProgress(event: SetupStepEvent): void {
  for (const callback of browserListeners.setupProgress) {
    callback(event);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortWorkspaceId(workspaceId: string): string {
  const short = workspaceId
    .split("")
    .filter((char) => /[a-z0-9]/i.test(char))
    .join("")
    .slice(0, 8);
  return short.length > 0 ? short : "workspace";
}

function slugifyWorkspaceName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/.]+/g, "")
    .replace(/[\s\-_/.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "workspace";
}

function renameBrowserWorktreePath(
  worktreePath: string | null,
  workspaceName: string,
  workspaceId: string,
): string | null {
  if (!worktreePath) {
    return null;
  }

  const lastSeparatorIndex = Math.max(worktreePath.lastIndexOf("/"), worktreePath.lastIndexOf("\\"));
  const parent = lastSeparatorIndex >= 0 ? worktreePath.slice(0, lastSeparatorIndex) : "";
  const nextLeaf = `${slugifyWorkspaceName(workspaceName)}--${shortWorkspaceId(workspaceId)}`;
  return parent.length > 0 ? `${parent}/${nextLeaf}` : nextLeaf;
}

function normalizeBrowserWorkspaceRow(workspace: Partial<BrowserWorkspaceRow>): BrowserWorkspaceRow {
  return {
    ...workspace,
    created_at: workspace.created_at ?? nowIso(),
    created_by: workspace.created_by ?? null,
    expires_at: workspace.expires_at ?? null,
    failed_at: workspace.failed_at ?? null,
    failure_reason: workspace.failure_reason ?? null,
    git_sha: workspace.git_sha ?? null,
    id: workspace.id ?? crypto.randomUUID(),
    last_active_at: workspace.last_active_at ?? nowIso(),
    mode: workspace.mode ?? "local",
    name: workspace.name?.trim() || workspace.source_ref?.trim() || "Workspace",
    name_origin: workspace.name_origin ?? "manual",
    project_id: workspace.project_id ?? "",
    source_ref: workspace.source_ref ?? "main",
    source_workspace_id: workspace.source_workspace_id ?? null,
    status: workspace.status ?? "sleeping",
    updated_at: workspace.updated_at ?? nowIso(),
    worktree_path: workspace.worktree_path ?? null,
  };
}

function updateWorkspaceRow(
  workspaceId: string,
  nextStatus: WorkspaceStatus,
  failureReason: WorkspaceFailureReason | null = null,
): void {
  browserWorkspaceState = {
    ...browserWorkspaceState,
    workspaces: browserWorkspaceState.workspaces.map((workspace) =>
      workspace.id === workspaceId
        ? {
            ...workspace,
            status: nextStatus,
            failure_reason: failureReason,
            failed_at: failureReason ? nowIso() : null,
            updated_at: nowIso(),
            last_active_at: nowIso(),
          }
        : workspace,
    ),
  };

  persistBrowserWorkspaceState();

  emitWorkspaceStatus({
    workspace_id: workspaceId,
    status: nextStatus,
    failure_reason: failureReason,
  });
}

export interface CreateWorkspaceInput {
  projectId: string;
  projectPath: string;
  workspaceName?: string;
  baseRef?: string;
  worktreeRoot?: string;
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<string> {
  if (!isTauri()) {
    const id = crypto.randomUUID();
    const now = nowIso();
    const workspace: WorkspaceRow = {
      id,
      project_id: input.projectId,
      name: input.workspaceName?.trim() || input.baseRef?.trim() || "Workspace",
      source_ref: input.baseRef ?? "main",
      git_sha: null,
      worktree_path: `${input.worktreeRoot ?? `${input.projectPath}/.worktrees`}/${id}`,
      mode: "local",
      status: "sleeping",
      failure_reason: null,
      failed_at: null,
      created_by: null,
      source_workspace_id: null,
      created_at: now,
      updated_at: now,
      last_active_at: now,
      expires_at: null,
    };

    browserWorkspaceState = {
      ...browserWorkspaceState,
      workspaces: [{ ...workspace, name_origin: "default" }, ...browserWorkspaceState.workspaces],
    };
    persistBrowserWorkspaceState();
    return id;
  }

  return invoke<string>("create_workspace", {
    projectId: input.projectId,
    projectPath: input.projectPath,
    workspaceName: input.workspaceName,
    baseRef: input.baseRef,
    worktreeRoot: input.worktreeRoot,
  });
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRow> {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (normalizedName.length === 0) {
    throw new Error("Workspace name cannot be empty.");
  }

  if (!isTauri()) {
    let renamedWorkspace: BrowserWorkspaceRow | null = null;
    browserWorkspaceState = {
      ...browserWorkspaceState,
      workspaces: browserWorkspaceState.workspaces.map((workspace) => {
        if (workspace.id !== workspaceId) {
          return workspace;
        }

        renamedWorkspace = {
          ...workspace,
          name: normalizedName,
          name_origin: "manual",
          updated_at: nowIso(),
          worktree_path: renameBrowserWorktreePath(
            workspace.worktree_path,
            normalizedName,
            workspaceId,
          ),
        };
        return renamedWorkspace;
      }),
    };
    persistBrowserWorkspaceState();

    if (!renamedWorkspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const nextWorkspace = renamedWorkspace as BrowserWorkspaceRow;
    emitWorkspaceRenamed({
      workspace_id: nextWorkspace.id,
      name: nextWorkspace.name,
      worktree_path: nextWorkspace.worktree_path,
    });
    return nextWorkspace;
  }

  return invoke<WorkspaceRow>("rename_workspace", { workspaceId, name: normalizedName });
}

export async function subscribeToNativeWorkspaceShortcutEvents(
  callback: (event: WorkspaceShortcutEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }

  return listen<WorkspaceShortcutEvent>("native-workspace:shortcut", (event) => {
    callback(event.payload);
  });
}

export async function startServices(workspaceId: string, manifestJson: string): Promise<void> {
  if (!isTauri()) {
    updateWorkspaceRow(workspaceId, "starting");

    const manifest = JSON.parse(manifestJson) as {
      setup?: { steps?: Array<{ name?: string; command?: string }> };
      services?: Record<string, { port?: number }>;
    };

    const setupSteps = Array.isArray(manifest.setup?.steps) ? manifest.setup.steps : [];
    for (const [index, step] of setupSteps.entries()) {
      const stepName = step.name ?? `step-${index + 1}`;
      emitSetupProgress({
        workspace_id: workspaceId,
        step_name: stepName,
        event_type: "started",
        data: null,
      });
      emitSetupProgress({
        workspace_id: workspaceId,
        step_name: stepName,
        event_type: "stdout",
        data: step.command ? `$ ${step.command}` : "Running setup",
      });
      await delay(60);
      emitSetupProgress({
        workspace_id: workspaceId,
        step_name: stepName,
        event_type: "completed",
        data: null,
      });
    }

    const serviceEntries = Object.entries(manifest.services ?? {});
    const now = nowIso();
    const nextServices = browserWorkspaceState.services.filter(
      (svc) => svc.workspace_id !== workspaceId,
    );
    for (const [serviceName, serviceConfig] of serviceEntries) {
      nextServices.push({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        service_name: serviceName,
        exposure: "local",
        port_override: null,
        status: "starting",
        status_reason: null,
        default_port: serviceConfig.port ?? null,
        effective_port: serviceConfig.port ?? null,
        preview_state: "disabled",
        preview_failure_reason: null,
        preview_url: null,
        created_at: now,
        updated_at: now,
      });

      emitServiceStatus({
        workspace_id: workspaceId,
        service_name: serviceName,
        status: "starting",
        status_reason: null,
      });
      await delay(40);
      emitServiceStatus({
        workspace_id: workspaceId,
        service_name: serviceName,
        status: "ready",
        status_reason: null,
      });
    }

    browserWorkspaceState = {
      ...browserWorkspaceState,
      services: nextServices.map((service) =>
        service.workspace_id === workspaceId
          ? { ...service, status: "ready", updated_at: nowIso() }
          : service,
      ),
    };
    persistBrowserWorkspaceState();
    updateWorkspaceRow(workspaceId, "ready");
    return;
  }

  return invoke<void>("start_services", { workspaceId, manifestJson });
}

export async function stopWorkspace(workspaceId: string): Promise<void> {
  if (!isTauri()) {
    browserWorkspaceState = {
      ...browserWorkspaceState,
      services: browserWorkspaceState.services.map((service) =>
        service.workspace_id === workspaceId
          ? { ...service, status: "stopped", status_reason: null, updated_at: nowIso() }
          : service,
      ),
    };
    persistBrowserWorkspaceState();

    for (const service of browserWorkspaceState.services) {
      if (service.workspace_id !== workspaceId) continue;
      emitServiceStatus({
        workspace_id: workspaceId,
        service_name: service.service_name,
        status: "stopped",
        status_reason: null,
      });
    }

    updateWorkspaceRow(workspaceId, "sleeping");
    return;
  }

  return invoke<void>("stop_workspace", { workspaceId });
}

export async function getWorkspace(projectId: string): Promise<WorkspaceRow | null> {
  if (!isTauri()) {
    return (
      browserWorkspaceState.workspaces.find((workspace) => workspace.project_id === projectId) ??
      null
    );
  }

  return invoke<WorkspaceRow | null>("get_workspace", { projectId });
}

export async function getWorkspaceById(workspaceId: string): Promise<WorkspaceRow | null> {
  if (!isTauri()) {
    return (
      browserWorkspaceState.workspaces.find((workspace) => workspace.id === workspaceId) ?? null
    );
  }

  return invoke<WorkspaceRow | null>("get_workspace_by_id", { workspaceId });
}

export async function listWorkspaces(): Promise<WorkspaceRow[]> {
  if (!isTauri()) {
    return [...browserWorkspaceState.workspaces];
  }

  return invoke<WorkspaceRow[]>("list_workspaces");
}

export async function listWorkspacesByProject(): Promise<Record<string, WorkspaceRow[]>> {
  if (!isTauri()) {
    return browserWorkspaceState.workspaces.reduce<Record<string, WorkspaceRow[]>>(
      (acc, workspace) => {
        const projectWorkspaces = acc[workspace.project_id] ?? [];
        projectWorkspaces.push(workspace);
        acc[workspace.project_id] = projectWorkspaces;
        return acc;
      },
      {},
    );
  }

  return invoke<Record<string, WorkspaceRow[]>>("list_workspaces_by_project");
}

export async function getWorkspaceServices(workspaceId: string): Promise<ServiceRow[]> {
  if (!isTauri()) {
    return browserWorkspaceState.services.filter((service) => service.workspace_id === workspaceId);
  }

  return invoke<ServiceRow[]>("get_workspace_services", { workspaceId });
}

export async function getCurrentBranch(projectPath: string): Promise<string> {
  if (!isTauri()) {
    return "main";
  }

  return invoke<string>("get_current_branch", { projectPath });
}

export interface WorkspaceEventCallbacks {
  onWorkspaceStatus?: (event: WorkspaceStatusEvent) => void;
  onServiceStatus?: (event: ServiceStatusEvent) => void;
  onSetupProgress?: (event: SetupStepEvent) => void;
}

export async function subscribeToWorkspaceStatusEvents(
  callback: (event: WorkspaceStatusEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    browserListeners.workspaceStatus.add(callback);
    return () => {
      browserListeners.workspaceStatus.delete(callback);
    };
  }

  return listen<WorkspaceStatusEvent>("workspace:status-changed", (e) => {
    callback(e.payload);
  });
}

export async function subscribeToWorkspaceRenamedEvents(
  callback: (event: WorkspaceRenamedEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    browserListeners.workspaceRenamed.add(callback);
    return () => {
      browserListeners.workspaceRenamed.delete(callback);
    };
  }

  return listen<WorkspaceRenamedEvent>("workspace:renamed", (event) => {
    callback(event.payload);
  });
}

export async function subscribeToServiceStatusEvents(
  callback: (event: ServiceStatusEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    browserListeners.serviceStatus.add(callback);
    return () => {
      browserListeners.serviceStatus.delete(callback);
    };
  }

  return listen<ServiceStatusEvent>("service:status-changed", (e) => {
    callback(e.payload);
  });
}

export async function subscribeToSetupProgressEvents(
  callback: (event: SetupStepEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    browserListeners.setupProgress.add(callback);
    return () => {
      browserListeners.setupProgress.delete(callback);
    };
  }

  return listen<SetupStepEvent>("setup:step-progress", (e) => {
    callback(e.payload);
  });
}

export async function subscribeToWorkspaceEvents(
  workspaceId: string,
  callbacks: WorkspaceEventCallbacks,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    const cleanup: Array<() => void> = [];

    if (callbacks.onWorkspaceStatus) {
      const cb = (event: WorkspaceStatusEvent) => {
        if (event.workspace_id === workspaceId) {
          callbacks.onWorkspaceStatus?.(event);
        }
      };
      browserListeners.workspaceStatus.add(cb);
      cleanup.push(() => browserListeners.workspaceStatus.delete(cb));
    }

    if (callbacks.onServiceStatus) {
      const cb = (event: ServiceStatusEvent) => {
        if (event.workspace_id === workspaceId) {
          callbacks.onServiceStatus?.(event);
        }
      };
      browserListeners.serviceStatus.add(cb);
      cleanup.push(() => browserListeners.serviceStatus.delete(cb));
    }

    if (callbacks.onSetupProgress) {
      const cb = (event: SetupStepEvent) => {
        if (event.workspace_id === workspaceId) {
          callbacks.onSetupProgress?.(event);
        }
      };
      browserListeners.setupProgress.add(cb);
      cleanup.push(() => browserListeners.setupProgress.delete(cb));
    }

    return () => {
      for (const unregister of cleanup) {
        unregister();
      }
    };
  }

  const unlisteners: UnlistenFn[] = [];

  if (callbacks.onWorkspaceStatus) {
    const cb = callbacks.onWorkspaceStatus;
    unlisteners.push(
      await listen<WorkspaceStatusEvent>("workspace:status-changed", (e) => {
        if (e.payload.workspace_id === workspaceId) {
          cb(e.payload);
        }
      }),
    );
  }

  if (callbacks.onServiceStatus) {
    const cb = callbacks.onServiceStatus;
    unlisteners.push(
      await listen<ServiceStatusEvent>("service:status-changed", (e) => {
        if (e.payload.workspace_id === workspaceId) {
          cb(e.payload);
        }
      }),
    );
  }

  if (callbacks.onSetupProgress) {
    const cb = callbacks.onSetupProgress;
    unlisteners.push(
      await listen<SetupStepEvent>("setup:step-progress", (e) => {
        if (e.payload.workspace_id === workspaceId) {
          cb(e.payload);
        }
      }),
    );
  }

  return () => {
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}
