import { useCallback, useEffect, useState } from "react";
import {
  hasFileViewerConflict,
  isFileViewerDirty,
  type FileViewerSessionState,
} from "../lib/file-session";

export type WorkspaceFileSessionsState = Record<string, FileViewerSessionState>;

export function pruneWorkspaceFileSessions(
  current: WorkspaceFileSessionsState,
  openFileTabKeys: Iterable<string>,
): WorkspaceFileSessionsState {
  const openKeys = new Set(openFileTabKeys);
  const nextEntries = Object.entries(current).filter(([key]) => openKeys.has(key));
  if (nextEntries.length === Object.keys(current).length) {
    return current;
  }

  return Object.fromEntries(nextEntries);
}

export function updateWorkspaceFileSession(
  current: WorkspaceFileSessionsState,
  tabKey: string,
  nextState: FileViewerSessionState | null,
): WorkspaceFileSessionsState {
  if (nextState === null) {
    if (!(tabKey in current)) {
      return current;
    }

    const next = { ...current };
    delete next[tabKey];
    return next;
  }

  const previous = current[tabKey];
  if (
    previous?.draftContent === nextState.draftContent &&
    previous?.savedContent === nextState.savedContent &&
    previous?.conflictDiskContent === nextState.conflictDiskContent
  ) {
    return current;
  }

  return {
    ...current,
    [tabKey]: nextState,
  };
}

export function buildCloseWorkspaceFileSessionPrompt(
  sessionState: FileViewerSessionState | null | undefined,
  label: string,
): string | null {
  if (!isFileViewerDirty(sessionState)) {
    return null;
  }

  return hasFileViewerConflict(sessionState)
    ? `"${label}" has unsaved edits and changed on disk. Close the tab and discard your local draft?`
    : `"${label}" has unsaved edits. Close the tab and discard them?`;
}

export function useWorkspaceFileSessions(openFileTabKeys: readonly string[]) {
  const [fileSessionsByTabKey, setFileSessionsByTabKey] = useState<WorkspaceFileSessionsState>({});

  useEffect(() => {
    setFileSessionsByTabKey((current) => pruneWorkspaceFileSessions(current, openFileTabKeys));
  }, [openFileTabKeys]);

  const confirmCloseFileSession = useCallback(
    (tabKey: string, label: string) => {
      const message = buildCloseWorkspaceFileSessionPrompt(fileSessionsByTabKey[tabKey], label);
      return message ? window.confirm(message) : true;
    },
    [fileSessionsByTabKey],
  );

  const clearFileSession = useCallback((tabKey: string) => {
    setFileSessionsByTabKey((current) => updateWorkspaceFileSession(current, tabKey, null));
  }, []);

  const handleFileSessionStateChange = useCallback(
    (tabKey: string, nextState: FileViewerSessionState | null) => {
      setFileSessionsByTabKey((current) => updateWorkspaceFileSession(current, tabKey, nextState));
    },
    [],
  );

  return {
    clearFileSession,
    confirmCloseFileSession,
    fileSessionsByTabKey,
    handleFileSessionStateChange,
  };
}
