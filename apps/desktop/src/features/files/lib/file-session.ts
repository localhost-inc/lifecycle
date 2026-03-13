export interface FileViewerSessionState {
  conflictDiskContent: string | null;
  draftContent: string | null;
  savedContent: string | null;
}

export function isFileViewerDirty(
  sessionState: FileViewerSessionState | null | undefined,
): boolean {
  if (!sessionState) {
    return false;
  }

  return (
    sessionState.draftContent !== null &&
    sessionState.savedContent !== null &&
    sessionState.draftContent !== sessionState.savedContent
  );
}

export function hasFileViewerConflict(
  sessionState: FileViewerSessionState | null | undefined,
): boolean {
  return typeof sessionState?.conflictDiskContent === "string";
}
