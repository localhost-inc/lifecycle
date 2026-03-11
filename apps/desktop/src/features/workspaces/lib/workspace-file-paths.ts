export function normalizeWorkspaceFilePath(filePath: string): string {
  const trimmed = filePath.trim().replaceAll("\\", "/");
  if (!trimmed || trimmed.startsWith("/")) {
    return trimmed;
  }

  const segments: string[] = [];

  for (const segment of trimmed.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length === 0) {
        return trimmed;
      }

      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments.join("/") || trimmed;
}

export function workspaceFileBasename(filePath: string): string {
  const normalized = normalizeWorkspaceFilePath(filePath);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

export function workspaceFileDirname(filePath: string): string {
  const normalized = normalizeWorkspaceFilePath(filePath);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? "" : normalized.slice(0, lastSlash + 1);
}

export function workspaceFileExtension(filePath: string): string | null {
  const basename = workspaceFileBasename(filePath);
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === basename.length - 1) {
    return null;
  }

  return basename.slice(dotIndex + 1).toLowerCase();
}
