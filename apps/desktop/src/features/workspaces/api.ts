import { isTauri } from "@tauri-apps/api/core";
import type {
  LifecycleConfig,
  LifecycleEvent,
  ServiceRecord,
  TerminalRecord,
  WorkspaceKind,
  WorkspaceRecord,
  WorkspaceServiceExposure,
} from "@lifecycle/contracts";
import { getManifestFingerprint } from "@lifecycle/contracts";
import { getWorkspaceProvider } from "../../lib/workspace-provider";

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

  const providerWorkspaceId = crypto.randomUUID();
  const sourceRef =
    input.baseRef ??
    browserWorkspaceSourceRef(input.workspaceName ?? "workspace", providerWorkspaceId);
  const result = await getWorkspaceProvider().createWorkspace({
    workspaceId: providerWorkspaceId,
    sourceRef,
    manifestPath: "",
    manifestJson: input.manifestJson ?? null,
    manifestFingerprint: input.manifestFingerprint ?? null,
    resolvedSecrets: {},
    context: {
      mode: "local",
      kind: input.kind ?? "managed",
      projectId: input.projectId,
      projectPath: input.projectPath,
      workspaceName: input.workspaceName,
      baseRef: input.baseRef,
      worktreeRoot: input.worktreeRoot,
    },
  });

  return result.workspace.id;
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

  return getWorkspaceProvider().renameWorkspace(workspaceId, normalizedName);
}

export async function startServices(input: {
  serviceNames?: string[];
  workspace: WorkspaceRecord;
  services: ServiceRecord[];
  manifestJson: string;
  manifestFingerprint: string;
}): Promise<void> {
  if (!isTauri()) {
    void input;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  await getWorkspaceProvider().startServices({
    serviceNames: input.serviceNames,
    workspace: input.workspace,
    services: input.services,
    manifestJson: input.manifestJson,
    manifestFingerprint: input.manifestFingerprint,
  });
}

export async function stopWorkspace(workspaceId: string): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return getWorkspaceProvider().sleep(workspaceId);
}

export async function destroyWorkspace(workspaceId: string): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return getWorkspaceProvider().destroy(workspaceId);
}

export async function getWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    void workspaceId;
    return null;
  }

  return getWorkspaceProvider().getWorkspace(workspaceId);
}

export async function getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return getWorkspaceProvider().getWorkspaceServices(workspaceId);
}

export interface WorkspaceSnapshotResult {
  services: ServiceRecord[];
  terminals: TerminalRecord[];
  workspace: WorkspaceRecord | null;
}

export type WorkspaceProgressStatus = "pending" | "running" | "completed" | "failed" | "timeout";

export interface WorkspaceStepProgressSnapshot {
  name: string;
  output: string[];
  status: WorkspaceProgressStatus;
}

export interface WorkspaceRuntimeProjectionResult {
  activity: LifecycleEvent[];
  environmentTasks: WorkspaceStepProgressSnapshot[];
  setup: WorkspaceStepProgressSnapshot[];
}

export async function getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshotResult> {
  if (!isTauri()) {
    void workspaceId;
    return {
      services: [],
      terminals: [],
      workspace: null,
    };
  }

  return getWorkspaceProvider().getWorkspaceSnapshot(workspaceId);
}

export async function getWorkspaceRuntimeProjection(
  workspaceId: string,
): Promise<WorkspaceRuntimeProjectionResult> {
  if (!isTauri()) {
    void workspaceId;
    return {
      activity: [],
      environmentTasks: [],
      setup: [],
    };
  }

  return getWorkspaceProvider().getWorkspaceRuntimeProjection(workspaceId);
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

  return getWorkspaceProvider().updateWorkspaceService({
    workspaceId,
    serviceName,
    portOverride: input.portOverride,
    exposure: input.exposure,
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

  return getWorkspaceProvider().syncWorkspaceManifest({
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

export interface WorkspaceFileTreeEntry {
  extension: string | null;
  file_path: string;
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

  return getWorkspaceProvider().readWorkspaceFile(workspaceId, filePath);
}

export async function writeWorkspaceFile(
  workspaceId: string,
  filePath: string,
  content: string,
): Promise<WorkspaceFileReadResult> {
  if (!isTauri()) {
    void workspaceId;
    void filePath;
    void content;
    throw new Error("Workspace file editing requires the Tauri desktop shell.");
  }

  return getWorkspaceProvider().writeWorkspaceFile(workspaceId, filePath, content);
}

export async function listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace file listing requires the Tauri desktop shell.");
  }

  return getWorkspaceProvider().listWorkspaceFiles(workspaceId);
}

export async function openWorkspaceFile(workspaceId: string, filePath: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await getWorkspaceProvider().openWorkspaceFile(workspaceId, filePath);
}
