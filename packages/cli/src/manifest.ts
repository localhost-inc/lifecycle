import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  getManifestFingerprint,
  LIFECYCLE_WORKSPACE_PATH_ENV,
  parseManifest,
  type LifecycleConfig,
} from "@lifecycle/contracts";

import { LifecycleCliError } from "./errors";

export const MANIFEST_FILE_NAME = "lifecycle.json";

export interface LoadedManifest {
  config: LifecycleConfig;
  manifestFingerprint: string;
  manifestJson: string;
  manifestPath: string;
  workspacePath: string;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveExplicitManifestPath(inputPath: string): Promise<string> {
  const resolvedPath = path.resolve(inputPath);
  const stats = await stat(resolvedPath).catch(() => null);

  if (!stats) {
    throw new LifecycleCliError({
      code: "manifest_not_found",
      message: `Lifecycle could not find ${resolvedPath}.`,
      suggestedAction: "Pass a valid repo path or lifecycle.json path, then retry.",
    });
  }

  if (stats.isDirectory()) {
    const manifestPath = path.join(resolvedPath, MANIFEST_FILE_NAME);
    if (await pathExists(manifestPath)) {
      return manifestPath;
    }

    throw new LifecycleCliError({
      code: "manifest_not_found",
      message: `Lifecycle could not find ${MANIFEST_FILE_NAME} in ${resolvedPath}.`,
      suggestedAction: "Create lifecycle.json first with `lifecycle repo init`, then retry.",
    });
  }

  return resolvedPath;
}

export async function findManifestPath(options?: {
  inputPath?: string;
  searchFrom?: string;
  workspacePath?: string;
}): Promise<string> {
  if (options?.inputPath) {
    return resolveExplicitManifestPath(options.inputPath);
  }

  const workspacePath = options?.workspacePath ?? process.env[LIFECYCLE_WORKSPACE_PATH_ENV];
  if (workspacePath) {
    const manifestPath = path.join(workspacePath, MANIFEST_FILE_NAME);
    if (await pathExists(manifestPath)) {
      return manifestPath;
    }
  }

  let currentDirectory = path.resolve(options?.searchFrom ?? process.cwd());

  while (true) {
    const manifestPath = path.join(currentDirectory, MANIFEST_FILE_NAME);
    if (await pathExists(manifestPath)) {
      return manifestPath;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }

  throw new LifecycleCliError({
    code: "manifest_not_found",
    message: "Lifecycle could not find lifecycle.json for this command.",
    suggestedAction:
      "Create lifecycle.json with `lifecycle repo init` or run the command from inside a configured repo.",
  });
}

export async function loadManifest(options?: {
  inputPath?: string;
  searchFrom?: string;
  workspacePath?: string;
}): Promise<LoadedManifest> {
  const manifestPath = await findManifestPath(options);
  const manifestText = await readFile(manifestPath, "utf8");
  const parsed = parseManifest(manifestText);

  if (!parsed.valid) {
    throw new LifecycleCliError({
      code: "manifest_invalid",
      details: {
        errors: parsed.errors,
        manifestPath,
      },
      message: `Lifecycle manifest validation failed for ${manifestPath}.`,
      suggestedAction: "Fix lifecycle.json validation errors, then retry.",
    });
  }

  return {
    config: parsed.config,
    manifestFingerprint: getManifestFingerprint(parsed.config),
    manifestJson: JSON.stringify(parsed.config),
    manifestPath,
    workspacePath: path.dirname(manifestPath),
  };
}
