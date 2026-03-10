const MANIFEST_FILE_NAME = "lifecycle.json";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

export function getProjectManifestPath(projectPath: string): string {
  return `${normalizePath(projectPath)}/${MANIFEST_FILE_NAME}`.toLowerCase();
}

export function watchEventTouchesManifest(
  projectPath: string,
  eventPaths: readonly string[],
): boolean {
  const manifestPath = getProjectManifestPath(projectPath);

  return eventPaths.some((path) => normalizePath(path).toLowerCase() === manifestPath);
}
