export interface FileEditorSessionState {
  conflictDiskContent: string | null;
  draftContent: string | null;
  savedContent: string | null;
}

export function isFileEditorDirty(
  sessionState: FileEditorSessionState | null | undefined,
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

export function hasFileEditorConflict(
  sessionState: FileEditorSessionState | null | undefined,
): boolean {
  return typeof sessionState?.conflictDiskContent === "string";
}
