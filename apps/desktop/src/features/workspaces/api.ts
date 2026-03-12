import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LifecycleConfig,
  ServiceRecord,
  TerminalRecord,
  WorkspaceKind,
  WorkspaceRecord,
  WorkspaceServiceExposure,
} from "@lifecycle/contracts";
import { getManifestFingerprint } from "@lifecycle/contracts";

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

export function shortWorkspaceId(workspaceId: string): string {
  const short = workspaceId
    .split("")
    .filter((char) => /[a-z0-9]/i.test(char))
    .join("")
    .slice(0, 8);
  return short.length > 0 ? short : "workspace";
}

export function slugifyWorkspaceName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/.]+/g, "")
    .replace(/[\s\-_/.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "workspace";
}

export function browserWorktreeDirectoryName(workspaceName: string, workspaceId: string): string {
  return `${slugifyWorkspaceName(workspaceName)}--${shortWorkspaceId(workspaceId)}`;
}

export function browserWorkspaceSourceRef(workspaceName: string, workspaceId: string): string {
  return `lifecycle/${slugifyWorkspaceName(workspaceName)}-${shortWorkspaceId(workspaceId)}`;
}

export interface CreateWorkspaceInput {
  kind?: WorkspaceKind;
  projectId: string;
  projectPath: string;
  workspaceName?: string;
  baseRef?: string;
  worktreeRoot?: string;
  manifestJson?: string;
  manifestFingerprint?: string | null;
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<string> {
  if (!isTauri()) {
    void input;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return invoke<string>("create_workspace", {
    input: {
      projectId: input.projectId,
      projectPath: input.projectPath,
      workspaceName: input.workspaceName,
      baseRef: input.baseRef,
      worktreeRoot: input.worktreeRoot,
      kind: input.kind ?? "managed",
      manifestJson: input.manifestJson ?? null,
      manifestFingerprint: input.manifestFingerprint ?? null,
    },
  });
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceRecord> {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (normalizedName.length === 0) {
    throw new Error("Workspace name cannot be empty.");
  }

  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace rename requires the Tauri desktop shell.");
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

export async function startServices(
  workspaceId: string,
  manifestJson: string,
  manifestFingerprint: string,
): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    void manifestJson;
    void manifestFingerprint;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return invoke<void>("start_services", { workspaceId, manifestJson, manifestFingerprint });
}

export async function stopWorkspace(workspaceId: string): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return invoke<void>("stop_workspace", { workspaceId });
}

export async function destroyWorkspace(workspaceId: string): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return invoke<void>("destroy_workspace", { workspaceId });
}

export async function getWorkspace(projectId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    void projectId;
    return null;
  }

  return invoke<WorkspaceRecord | null>("get_workspace", { projectId });
}

export async function getWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    void workspaceId;
    return null;
  }

  return invoke<WorkspaceRecord | null>("get_workspace_by_id", { workspaceId });
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  if (!isTauri()) {
    return [];
  }

  return invoke<WorkspaceRecord[]>("list_workspaces");
}

export async function listWorkspacesByProject(): Promise<Record<string, WorkspaceRecord[]>> {
  if (!isTauri()) {
    return {};
  }

  return invoke<Record<string, WorkspaceRecord[]>>("list_workspaces_by_project");
}

export async function getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return invoke<ServiceRecord[]>("get_workspace_services", { workspaceId });
}

export interface WorkspaceSnapshotResult {
  services: ServiceRecord[];
  terminals: TerminalRecord[];
  workspace: WorkspaceRecord | null;
}

export async function getWorkspaceSnapshot(
  workspaceId: string,
): Promise<WorkspaceSnapshotResult> {
  if (!isTauri()) {
    void workspaceId;
    return {
      services: [],
      terminals: [],
      workspace: null,
    };
  }

  return invoke<WorkspaceSnapshotResult>("get_workspace_snapshot", { workspaceId });
}

export interface UpdateWorkspaceServiceInput {
  exposure: WorkspaceServiceExposure;
  portOverride: number | null;
}

export async function updateWorkspaceService(
  workspaceId: string,
  serviceName: string,
  input: UpdateWorkspaceServiceInput,
): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    void serviceName;
    void input;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return invoke<void>("update_workspace_service", {
    workspaceId,
    serviceName,
    exposure: input.exposure,
    portOverride: input.portOverride,
  });
}

export async function syncWorkspaceManifest(
  workspaceId: string,
  config: LifecycleConfig | null,
): Promise<void> {
  const manifestJson = config ? JSON.stringify(config) : null;
  const manifestFingerprint = config ? getManifestFingerprint(config) : null;

  if (!isTauri()) {
    return;
  }

  return invoke<void>("sync_workspace_manifest", {
    workspaceId,
    manifestJson,
    manifestFingerprint,
  });
}

export interface WorkspaceFileReadResult {
  absolute_path: string;
  byte_len: number;
  content: string | null;
  extension: string | null;
  file_path: string;
  is_binary: boolean;
  is_too_large: boolean;
}

export async function readWorkspaceFile(
  workspaceId: string,
  filePath: string,
): Promise<WorkspaceFileReadResult> {
  if (!isTauri()) {
    void workspaceId;
    void filePath;
    throw new Error("Workspace file reading requires the Tauri desktop shell.");
  }

  return invoke<WorkspaceFileReadResult>("read_workspace_file", {
    workspaceId,
    filePath,
  });
}

export async function openWorkspaceFile(workspaceId: string, filePath: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("open_workspace_file", {
    workspaceId,
    filePath,
  });
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
