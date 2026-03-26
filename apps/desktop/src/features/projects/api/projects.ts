import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { parseManifest } from "@lifecycle/contracts";
import type { ManifestParseResult } from "@lifecycle/contracts";
import { invokeTauri } from "@/lib/tauri-error";

export type ManifestStatus =
  | { state: "valid"; result: ManifestParseResult & { valid: true } }
  | { state: "invalid"; result: ManifestParseResult & { valid: false } }
  | { state: "missing" };

interface ManifestFileReader {
  exists: (path: string) => Promise<boolean>;
  readTextFile: (path: string) => Promise<string>;
}

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

  const text = await invokeTauri<string | null>("read_manifest_text", { dirPath });
  if (text === null) {
    return { state: "missing" };
  }

  const result = parseManifest(text);
  if (result.valid) {
    return { state: "valid", result };
  }

  return { state: "invalid", result };
}

export async function chooseProjectDirectory(): Promise<string | null> {
  if (!isTauri()) {
    throw new Error("Project import requires the Tauri desktop shell.");
  }

  return open({ directory: true, multiple: false });
}

export async function cleanupProject(projectId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauri<void>("cleanup_project", { id: projectId });
}
