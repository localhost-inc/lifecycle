import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ServiceRecord,
  SetupStepEventType,
  WorkspaceRecord,
  WorkspaceStatus,
  WorkspaceFailureReason,
  WorkspaceServiceStatus,
  WorkspaceServiceStatusReason,
} from "@lifecycle/contracts";
import { publishBrowserLifecycleEvent } from "../events/api";

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
  workspaces: BrowserWorkspaceRecord[];
  services: ServiceRecord[];
}

interface BrowserWorkspaceRecord extends WorkspaceRecord {
  name_origin?: "default" | "generated" | "manual";
  source_ref_origin?: "default" | "generated" | "manual";
}

const BROWSER_WORKSPACES_STORAGE_KEY = "lifecycle.desktop.browser.workspaces.v1";

let browserWorkspaceState = readBrowserWorkspaceState();

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
        ? parsed.workspaces.map((workspace) => normalizeBrowserWorkspaceRecord(workspace))
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

function emitWorkspaceStatus(
  workspaceId: string,
  status: WorkspaceStatus,
  failureReason: WorkspaceFailureReason | null,
): void {
  publishBrowserLifecycleEvent({
    type: "workspace.status_changed",
    workspace_id: workspaceId,
    status,
    failure_reason: failureReason,
  });
}

function emitWorkspaceRenamed(
  workspaceId: string,
  name: string,
  sourceRef: string,
  worktreePath: string | null,
): void {
  publishBrowserLifecycleEvent({
    type: "workspace.renamed",
    workspace_id: workspaceId,
    name,
    source_ref: sourceRef,
    worktree_path: worktreePath,
  });
}

function emitServiceStatus(
  workspaceId: string,
  serviceName: string,
  status: WorkspaceServiceStatus,
  statusReason: WorkspaceServiceStatusReason | null,
): void {
  publishBrowserLifecycleEvent({
    type: "service.status_changed",
    workspace_id: workspaceId,
    service_name: serviceName,
    status,
    status_reason: statusReason,
  });
}

function emitSetupProgress(
  workspaceId: string,
  stepName: string,
  eventType: SetupStepEventType,
  data: string | null,
): void {
  publishBrowserLifecycleEvent({
    type: "setup.step_progress",
    workspace_id: workspaceId,
    step_name: stepName,
    event_type: eventType,
    data,
  });
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

  const lastSeparatorIndex = Math.max(
    worktreePath.lastIndexOf("/"),
    worktreePath.lastIndexOf("\\"),
  );
  const parent = lastSeparatorIndex >= 0 ? worktreePath.slice(0, lastSeparatorIndex) : "";
  const nextLeaf = `${slugifyWorkspaceName(workspaceName)}--${shortWorkspaceId(workspaceId)}`;
  return parent.length > 0 ? `${parent}/${nextLeaf}` : nextLeaf;
}

function browserWorkspaceSourceRef(workspaceName: string, workspaceId: string): string {
  return `lifecycle/${slugifyWorkspaceName(workspaceName)}-${shortWorkspaceId(workspaceId)}`;
}

function normalizeBrowserWorkspaceRecord(
  workspace: Partial<BrowserWorkspaceRecord>,
): BrowserWorkspaceRecord {
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
    source_ref_origin: workspace.source_ref_origin ?? "manual",
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

  emitWorkspaceStatus(workspaceId, nextStatus, failureReason);
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
    const workspace: WorkspaceRecord = {
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
      workspaces: [
        { ...workspace, name_origin: "default", source_ref_origin: "default" },
        ...browserWorkspaceState.workspaces,
      ],
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

export async function renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord> {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (normalizedName.length === 0) {
    throw new Error("Workspace name cannot be empty.");
  }

  if (!isTauri()) {
    let renamedWorkspace: BrowserWorkspaceRecord | null = null;
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
          source_ref: browserWorkspaceSourceRef(normalizedName, workspaceId),
          source_ref_origin: "manual",
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

    const nextWorkspace = renamedWorkspace as BrowserWorkspaceRecord;
    emitWorkspaceRenamed(
      nextWorkspace.id,
      nextWorkspace.name,
      nextWorkspace.source_ref,
      nextWorkspace.worktree_path,
    );
    return nextWorkspace;
  }

  return invoke<WorkspaceRecord>("rename_workspace", { workspaceId, name: normalizedName });
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
      emitSetupProgress(workspaceId, stepName, "started", null);
      emitSetupProgress(
        workspaceId,
        stepName,
        "stdout",
        step.command ? `$ ${step.command}` : "Running setup",
      );
      await delay(60);
      emitSetupProgress(workspaceId, stepName, "completed", null);
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

      emitServiceStatus(workspaceId, serviceName, "starting", null);
      await delay(40);
      emitServiceStatus(workspaceId, serviceName, "ready", null);
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
      emitServiceStatus(workspaceId, service.service_name, "stopped", null);
    }

    updateWorkspaceRow(workspaceId, "sleeping");
    return;
  }

  return invoke<void>("stop_workspace", { workspaceId });
}

export async function getWorkspace(projectId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    return (
      browserWorkspaceState.workspaces.find((workspace) => workspace.project_id === projectId) ??
      null
    );
  }

  return invoke<WorkspaceRecord | null>("get_workspace", { projectId });
}

export async function getWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    return (
      browserWorkspaceState.workspaces.find((workspace) => workspace.id === workspaceId) ?? null
    );
  }

  return invoke<WorkspaceRecord | null>("get_workspace_by_id", { workspaceId });
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  if (!isTauri()) {
    return [...browserWorkspaceState.workspaces];
  }

  return invoke<WorkspaceRecord[]>("list_workspaces");
}

export async function listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>> {
  if (!isTauri()) {
    return browserWorkspaceState.workspaces.reduce<Record<string, WorkspaceRecord[]>>(
      (acc, workspace) => {
        const projectWorkspaces = acc[workspace.project_id] ?? [];
        projectWorkspaces.push(workspace);
        acc[workspace.project_id] = projectWorkspaces;
        return acc;
      },
      {},
    );
  }

  return invoke<Record<string, WorkspaceRecord[]>>("list_workspaces_by_project");
}

export async function getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]> {
  if (!isTauri()) {
    return browserWorkspaceState.services.filter((service) => service.workspace_id === workspaceId);
  }

  return invoke<ServiceRecord[]>("get_workspace_services", { workspaceId });
}

export type OpenInAppId =
  | "cursor"
  | "finder"
  | "ghostty"
  | "iterm"
  | "terminal"
  | "vscode"
  | "warp"
  | "windsurf"
  | "xcode"
  | "zed";

export interface WorkspaceOpenInAppInfo {
  icon_data_url: string | null;
  id: OpenInAppId;
  label: string;
}

export async function openWorkspaceInApp(workspaceId: string, appId: OpenInAppId): Promise<void> {
  if (!isTauri()) {
    console.warn("[browser] open_workspace_in_app is not supported outside Tauri");
    return;
  }

  return invoke<void>("open_workspace_in_app", { workspaceId, appId });
}

export async function listWorkspaceOpenInApps(): Promise<WorkspaceOpenInAppInfo[]> {
  if (!isTauri()) {
    return [];
  }

  return invoke<WorkspaceOpenInAppInfo[]>("list_workspace_open_in_apps");
}

export async function getCurrentBranch(projectPath: string): Promise<string> {
  if (!isTauri()) {
    return "main";
  }

  return invoke<string>("get_current_branch", { projectPath });
}
