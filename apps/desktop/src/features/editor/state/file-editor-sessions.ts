import { useCallback, useEffect, useState } from "react";
import {
  hasFileEditorConflict,
  isFileEditorDirty,
  type FileEditorSessionState,
} from "@/features/editor/lib/file-editor-session";

export type FileEditorSessionsState = Record<string, FileEditorSessionState>;

export function pruneFileEditorSessions(
  current: FileEditorSessionsState,
  openFileTabKeys: Iterable<string>,
): FileEditorSessionsState {
  const openKeys = new Set(openFileTabKeys);
  const nextEntries = Object.entries(current).filter(([key]) => openKeys.has(key));
  if (nextEntries.length === Object.keys(current).length) {
    return current;
  }

  return Object.fromEntries(nextEntries);
}

export function updateFileEditorSession(
  current: FileEditorSessionsState,
  tabKey: string,
  nextState: FileEditorSessionState | null,
): FileEditorSessionsState {
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

export function buildCloseFileEditorSessionPrompt(
  sessionState: FileEditorSessionState | null | undefined,
  label: string,
): string | null {
  if (!isFileEditorDirty(sessionState)) {
    return null;
  }

  return hasFileEditorConflict(sessionState)
    ? `"${label}" has unsaved edits and changed on disk. Close the tab and discard your local draft?`
    : `"${label}" has unsaved edits. Close the tab and discard them?`;
}

export function useFileEditorSessions(openFileTabKeys: readonly string[]) {
  const [fileEditorSessionsByTabKey, setFileEditorSessionsByTabKey] =
    useState<FileEditorSessionsState>({});

  useEffect(() => {
    setFileEditorSessionsByTabKey((current) => pruneFileEditorSessions(current, openFileTabKeys));
  }, [openFileTabKeys]);

  const confirmCloseFileEditorSession = useCallback(
    (tabKey: string, label: string) => {
      const message = buildCloseFileEditorSessionPrompt(fileEditorSessionsByTabKey[tabKey], label);
      return message ? window.confirm(message) : true;
    },
    [fileEditorSessionsByTabKey],
  );

  const clearFileEditorSession = useCallback((tabKey: string) => {
    setFileEditorSessionsByTabKey((current) => updateFileEditorSession(current, tabKey, null));
  }, []);

  const handleFileEditorSessionStateChange = useCallback(
    (tabKey: string, nextState: FileEditorSessionState | null) => {
      setFileEditorSessionsByTabKey((current) =>
        updateFileEditorSession(current, tabKey, nextState),
      );
    },
    [],
  );

  return {
    clearFileEditorSession,
    confirmCloseFileEditorSession,
    fileEditorSessionsByTabKey,
    handleFileEditorSessionStateChange,
  };
}
