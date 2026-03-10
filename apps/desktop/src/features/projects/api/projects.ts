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

interface BrowserProjectsState {
  projects: ProjectRow[];
  manifestsByPath: Record<string, string>;
}

const BROWSER_PROJECTS_STORAGE_KEY = "lifecycle.desktop.browser.projects";

const BROWSER_MANIFEST_TEXT = JSON.stringify({
  setup: {
    steps: [{ name: "install", command: "bun install", timeout_seconds: 120 }],
  },
  services: {
    web: {
      runtime: "process",
      command: "bun run dev",
      port: 3000,
    },
  },
});

const DEFAULT_BROWSER_PROJECT: ProjectRow = {
  id: "browser-project-demo",
  path: "/browser/demo-project",
  name: "Demo Project",
  manifest_path: "/browser/demo-project/lifecycle.json",
  manifest_valid: true,
  organization_id: null,
  repository_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let browserProjectsState = readBrowserProjectsState();

function readBrowserProjectsState(): BrowserProjectsState {
  if (typeof window === "undefined") {
    return {
      projects: [DEFAULT_BROWSER_PROJECT],
      manifestsByPath: { [DEFAULT_BROWSER_PROJECT.path]: BROWSER_MANIFEST_TEXT },
    };
  }

  const raw = window.localStorage.getItem(BROWSER_PROJECTS_STORAGE_KEY);
  if (!raw) {
    return {
      projects: [DEFAULT_BROWSER_PROJECT],
      manifestsByPath: { [DEFAULT_BROWSER_PROJECT.path]: BROWSER_MANIFEST_TEXT },
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BrowserProjectsState>;
    const projects = Array.isArray(parsed.projects) ? parsed.projects : [DEFAULT_BROWSER_PROJECT];
    const manifestsByPath =
      parsed.manifestsByPath && typeof parsed.manifestsByPath === "object"
        ? parsed.manifestsByPath
        : { [DEFAULT_BROWSER_PROJECT.path]: BROWSER_MANIFEST_TEXT };

    if (!manifestsByPath[DEFAULT_BROWSER_PROJECT.path]) {
      manifestsByPath[DEFAULT_BROWSER_PROJECT.path] = BROWSER_MANIFEST_TEXT;
    }

    return { projects, manifestsByPath };
  } catch {
    return {
      projects: [DEFAULT_BROWSER_PROJECT],
      manifestsByPath: { [DEFAULT_BROWSER_PROJECT.path]: BROWSER_MANIFEST_TEXT },
    };
  }
}

function persistBrowserProjectsState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BROWSER_PROJECTS_STORAGE_KEY, JSON.stringify(browserProjectsState));
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
    const manifestText = browserProjectsState.manifestsByPath[dirPath];
    if (!manifestText) {
      return { state: "missing" };
    }

    const result = parseManifest(manifestText);
    if (result.valid) {
      return { state: "valid", result };
    }
    return { state: "invalid", result };
  }

  return readManifestFromFs(dirPath, tauriManifestFileReader);
}

export async function listProjects(): Promise<ProjectRecord[]> {
  if (!isTauri()) {
    return browserProjectsState.projects.map(rowToRecord);
  }

  const rows = await invoke<ProjectRow[]>("list_projects");
  return rows.map(rowToRecord);
}

export async function addProjectFromDirectory(): Promise<ProjectRecord | null> {
  if (!isTauri()) {
    const id = generateId();
    const now = new Date().toISOString();
    const index = browserProjectsState.projects.length + 1;
    const path = `/browser/project-${index}`;
    const row: ProjectRow = {
      id,
      path,
      name: `Project ${index}`,
      manifest_path: `${path}/lifecycle.json`,
      manifest_valid: true,
      organization_id: null,
      repository_id: null,
      created_at: now,
      updated_at: now,
    };

    browserProjectsState = {
      projects: [row, ...browserProjectsState.projects],
      manifestsByPath: {
        ...browserProjectsState.manifestsByPath,
        [path]: BROWSER_MANIFEST_TEXT,
      },
    };
    persistBrowserProjectsState();

    return rowToRecord(row);
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
    const project = browserProjectsState.projects.find((item) => item.id === id);
    const manifestsByPath = { ...browserProjectsState.manifestsByPath };
    if (project) {
      delete manifestsByPath[project.path];
    }

    browserProjectsState = {
      ...browserProjectsState,
      manifestsByPath,
      projects: browserProjectsState.projects.filter((project) => project.id !== id),
    };
    persistBrowserProjectsState();
    return;
  }

  await invoke("remove_project", { id });
}
