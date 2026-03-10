import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { parseManifest } from "@lifecycle/contracts";
import type { ManifestParseResult, ProjectRecord } from "@lifecycle/contracts";

export type ManifestStatus =
  | { state: "valid"; result: ManifestParseResult & { valid: true } }
  | { state: "invalid"; result: ManifestParseResult & { valid: false } }
  | { state: "missing" };

interface ProjectRow {
  id: string;
  path: string;
  name: string;
  manifest_path: string;
  manifest_valid: boolean;
  organization_id: string | null;
  repository_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    manifestPath: row.manifest_path,
    manifestValid: row.manifest_valid,
    organizationId: row.organization_id ?? undefined,
    repositoryId: row.repository_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

function nameFromPath(dirPath: string): string {
  const segments = dirPath.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] ?? "unknown";
}

interface ManifestFileReader {
  exists: (path: string) => Promise<boolean>;
  readTextFile: (path: string) => Promise<string>;
}

const tauriManifestFileReader: ManifestFileReader = {
  exists,
  readTextFile,
};

function manifestReadError(error: unknown): ManifestParseResult & { valid: false } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    valid: false,
    errors: [
      {
        path: "",
        message: `Failed to read lifecycle.json: ${message}`,
      },
    ],
  };
}

export async function readManifestFromFs(
  dirPath: string,
  fileReader: ManifestFileReader,
): Promise<ManifestStatus> {
  const manifestPath = `${dirPath}/lifecycle.json`;

  if (!(await fileReader.exists(manifestPath))) {
    return { state: "missing" };
  }

  try {
    const text = await fileReader.readTextFile(manifestPath);
    const result = parseManifest(text);
    if (result.valid) {
      return { state: "valid", result };
    }
    return { state: "invalid", result };
  } catch (error) {
    return { state: "invalid", result: manifestReadError(error) };
  }
}

export async function readManifest(dirPath: string): Promise<ManifestStatus> {
  if (!isTauri()) {
    return { state: "missing" };
  }

  return readManifestFromFs(dirPath, tauriManifestFileReader);
}

export async function listProjects(): Promise<ProjectRecord[]> {
  if (!isTauri()) {
    return [];
  }

  const rows = await invoke<ProjectRow[]>("list_projects");
  return rows.map(rowToRecord);
}

export async function addProjectFromDirectory(): Promise<ProjectRecord | null> {
  if (!isTauri()) {
    throw new Error("Project import requires the Tauri desktop shell.");
  }

  const dirPath = await open({ directory: true, multiple: false });
  if (!dirPath) return null;

  const name = nameFromPath(dirPath);
  const status = await readManifest(dirPath);
  const manifestValid = status.state === "valid";
  const id = generateId();

  const row = await invoke<ProjectRow>("add_project", {
    id,
    path: dirPath,
    name,
    manifestValid,
  });

  return rowToRecord(row);
}

export async function removeProject(id: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("remove_project", { id });
}
