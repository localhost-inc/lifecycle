import { isTauri } from "@tauri-apps/api/core";
import type {
  LifecycleEvent,
  ServiceRecord,
  WorkspaceCheckoutType,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { getBackend } from "@/lib/backend";
import { getWorkspaceClient } from "@/lib/workspace";

export interface CreateWorkspaceInput {
  checkoutType?: WorkspaceCheckoutType;
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
    throw new Error("Workspace access requires the Tauri desktop shell.");
  }

  const result = await getBackend().createWorkspace({
    manifestJson: input.manifestJson ?? null,
    manifestFingerprint: input.manifestFingerprint ?? null,
    context: {
      target: "host",
      checkoutType: input.checkoutType ?? "worktree",
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

  return getBackend().renameWorkspace(workspaceId, normalizedName);
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
    throw new Error("Workspace access requires the Tauri desktop shell.");
  }

  await getWorkspaceClient().startServices({
    serviceNames: input.serviceNames,
    workspace: input.workspace,
    services: input.services,
    manifestJson: input.manifestJson,
    manifestFingerprint: input.manifestFingerprint,
  });
}

export async function stopServices(workspaceId: string): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace access requires the Tauri desktop shell.");
  }

  return getWorkspaceClient().stopServices(workspaceId);
}

export async function destroyWorkspace(workspaceId: string): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace access requires the Tauri desktop shell.");
  }

  return getBackend().destroyWorkspace(workspaceId);
}

export async function getWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    void workspaceId;
    return null;
  }

  return getBackend().getWorkspace(workspaceId);
}

export async function getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return getWorkspaceClient().getServices(workspaceId);
}

export interface ServiceLogLine {
  stream: "stdout" | "stderr";
  text: string;
}

export interface ServiceLogSnapshot {
  name: string;
  lines: ServiceLogLine[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeServiceLogLines(lines: unknown[]): ServiceLogLine[] {
  return lines.map((entry) => {
    if (typeof entry === "string") {
      return { stream: "stdout" as const, text: entry };
    }
    if (
      entry !== null &&
      typeof entry === "object" &&
      "text" in entry &&
      typeof (entry as Record<string, unknown>).text === "string"
    ) {
      const record = entry as Record<string, unknown>;
      return {
        stream: record.stream === "stderr" ? ("stderr" as const) : ("stdout" as const),
        text: record.text as string,
      };
    }
    return { stream: "stdout" as const, text: String(entry) };
  });
}

function normalizeWorkspaceActivity(activity: unknown): LifecycleEvent[] {
  return Array.isArray(activity) ? (activity as LifecycleEvent[]) : [];
}

function normalizeWorkspaceServiceLogs(logs: unknown): ServiceLogSnapshot[] {
  return Array.isArray(logs)
    ? logs.map((entry) => {
        const record = asRecord(entry);
        return {
          name: typeof record?.name === "string" ? record.name : "",
          lines: Array.isArray(record?.lines) ? normalizeServiceLogLines(record.lines) : [],
        };
      })
    : [];
}

export async function getWorkspaceActivity(workspaceId: string): Promise<LifecycleEvent[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return normalizeWorkspaceActivity(await getWorkspaceClient().getActivity(workspaceId));
}

export async function getWorkspaceServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return normalizeWorkspaceServiceLogs(
    await getWorkspaceClient().getServiceLogs(workspaceId),
  );
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

  return getWorkspaceClient().readFile(workspaceId, filePath);
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

  return getWorkspaceClient().writeFile(workspaceId, filePath, content);
}

export async function listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace file listing requires the Tauri desktop shell.");
  }

  return getWorkspaceClient().listFiles(workspaceId);
}

export async function openWorkspaceFile(workspaceId: string, filePath: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await getWorkspaceClient().openFile(workspaceId, filePath);
}
