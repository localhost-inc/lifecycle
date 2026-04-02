const MANIFEST_FILE_NAME = "lifecycle.json";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

export function getManifestPath(dirPath: string): string {
  return `${normalizePath(dirPath)}/${MANIFEST_FILE_NAME}`.toLowerCase();
}

export function watchEventTouchesManifest(dirPath: string, eventPaths: readonly string[]): boolean {
  const manifestPath = getManifestPath(dirPath);

  return eventPaths.some((path) => normalizePath(path).toLowerCase() === manifestPath);
}
