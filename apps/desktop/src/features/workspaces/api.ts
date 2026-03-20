import { isTauri } from "@tauri-apps/api/core";
import type {
  EnvironmentRecord,
  LifecycleEvent,
  ServiceRecord,
  WorkspaceKind,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { getControlPlane } from "@/lib/control-plane";
import { getWorkspaceRuntime } from "@/lib/workspace-runtime";

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
  const result = await getControlPlane().createWorkspace({
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

  return getControlPlane().renameWorkspace(workspaceId, normalizedName);
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

  await getWorkspaceRuntime().startServices({
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

  return getWorkspaceRuntime().sleep(workspaceId);
}

export async function destroyWorkspace(workspaceId: string): Promise<void> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return getControlPlane().destroyWorkspace(workspaceId);
}

export async function getWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
  if (!isTauri()) {
    void workspaceId;
    return null;
  }

  return getControlPlane().getWorkspace(workspaceId);
}

export async function getWorkspaceEnvironment(
  workspaceId: string,
): Promise<EnvironmentRecord> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace runtime requires the Tauri desktop shell.");
  }

  return getWorkspaceRuntime().getEnvironment(workspaceId);
}

export async function getWorkspaceServices(workspaceId: string): Promise<ServiceRecord[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return getWorkspaceRuntime().getServices(workspaceId);
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

  return normalizeWorkspaceActivity(await getWorkspaceRuntime().getActivity(workspaceId));
}

export async function getWorkspaceServiceLogs(workspaceId: string): Promise<ServiceLogSnapshot[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return normalizeWorkspaceServiceLogs(
    await getWorkspaceRuntime().getServiceLogs(workspaceId),
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

  return getWorkspaceRuntime().readFile(workspaceId, filePath);
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

  return getWorkspaceRuntime().writeFile(workspaceId, filePath, content);
}

export async function listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileTreeEntry[]> {
  if (!isTauri()) {
    void workspaceId;
    throw new Error("Workspace file listing requires the Tauri desktop shell.");
  }

  return getWorkspaceRuntime().listFiles(workspaceId);
}

export async function openWorkspaceFile(workspaceId: string, filePath: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await getWorkspaceRuntime().openFile(workspaceId, filePath);
}
