import { parseManifest, type ManifestParseResult } from "@lifecycle/contracts";

export type ManifestStatus =
  | { state: "valid"; result: ManifestParseResult & { valid: true } }
  | { state: "invalid"; result: ManifestParseResult & { valid: false } }
  | { state: "missing" };

export interface ManifestFileReader {
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

export async function readManifestFromPath(
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
