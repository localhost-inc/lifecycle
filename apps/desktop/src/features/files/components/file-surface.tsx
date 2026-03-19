import { Alert, AlertAction, AlertDescription, EmptyState, FloatingToggle } from "@lifecycle/ui";
import { FileText } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "../../../app/shortcuts/shortcut-router";
import { workspaceFileBasename } from "../../workspaces/lib/workspace-file-paths";
import { writeWorkspaceFile } from "../../workspaces/api";
import { useWorkspaceFile } from "../../workspaces/hooks";
import { resolveFileEditorConfig } from "../lib/file-editor-config";
import type { FileViewerMode } from "../lib/file-view-mode";
import { isFileViewerDirty, type FileViewerSessionState } from "../lib/file-session";
import {
  getFileViewerScrollRestoreKey,
  resolveFileViewerRenderer,
  resolveInitialFileViewerMode,
  supportsFileViewerViewMode,
} from "../lib/file-renderers";
import { resolveFileRendererDefinition } from "../renderers/registry";
import { FileCodeEditor } from "./file-code-editor";

interface FileSurfaceProps {
  filePath: string;
  initialMode?: FileViewerMode;
  initialScrollTop?: number;
  onModeChange?: (mode: FileViewerMode) => void;
  onOpenFile: (filePath: string) => void;
  onScrollTopChange?: (scrollTop: number) => void;
  onSessionStateChange?: (state: FileViewerSessionState | null) => void;
  sessionState?: FileViewerSessionState | null;
  workspaceId: string;
}

export function FileSurface({
  filePath,
  initialMode,
  initialScrollTop = 0,
  onModeChange,
  onOpenFile,
  onScrollTopChange,
  onSessionStateChange,
  sessionState,
  workspaceId,
}: FileSurfaceProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mode, setMode] = useState<FileViewerMode>(() =>
    resolveInitialFileViewerMode(filePath, initialMode),
  );
  const restoredScrollKeyRef = useRef<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const modeSeedRef = useRef(`${filePath}:${initialMode ?? ""}`);

  const fileQuery = useWorkspaceFile(workspaceId, filePath);

  const displayPath = fileQuery.data?.file_path ?? filePath;
  const renderer = resolveFileViewerRenderer(displayPath);
  const rendererDefinition = resolveFileRendererDefinition(displayPath);
  const supportsViewMode = supportsFileViewerViewMode(renderer);
  const effectiveMode = supportsViewMode ? mode : "edit";
  const editorConfig = resolveFileEditorConfig(displayPath, rendererDefinition.editor);
  const textContent =
    fileQuery.data && !fileQuery.data.is_binary && !fileQuery.data.is_too_large
      ? (fileQuery.data.content ?? "")
      : null;
  const draftContent = sessionState?.draftContent ?? "";
  const savedContent = sessionState?.savedContent ?? "";
  const conflictDiskContent = sessionState?.conflictDiskContent ?? null;
  const isDirty = isFileViewerDirty(sessionState);

  useEffect(() => {
    const nextSeed = `${filePath}:${initialMode ?? ""}`;
    if (modeSeedRef.current === nextSeed) {
      return;
    }

    modeSeedRef.current = nextSeed;
    setMode(resolveInitialFileViewerMode(filePath, initialMode));
  }, [filePath, initialMode]);

  useEffect(() => {
    if (textContent === null) {
      return;
    }

    if (!sessionState || sessionState.savedContent === null || sessionState.draftContent === null) {
      onSessionStateChange?.({
        conflictDiskContent: null,
        draftContent: textContent,
        savedContent: textContent,
      });
      return;
    }

    if (textContent === sessionState.savedContent) {
      if (sessionState.conflictDiskContent !== null) {
        onSessionStateChange?.({
          ...sessionState,
          conflictDiskContent: null,
        });
      }
      return;
    }

    if (isDirty) {
      if (sessionState.conflictDiskContent !== textContent) {
        onSessionStateChange?.({
          ...sessionState,
          conflictDiskContent: textContent,
        });
      }
      return;
    }

    onSessionStateChange?.({
      conflictDiskContent: null,
      draftContent: textContent,
      savedContent: textContent,
    });
  }, [isDirty, onSessionStateChange, sessionState, textContent]);

  useEffect(() => {
    if (textContent === null) {
      return;
    }

    const refreshIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void fileQuery.refresh();
    };

    const timer = window.setInterval(refreshIfVisible, 5000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIfVisible();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fileQuery, textContent]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const restoreKey = getFileViewerScrollRestoreKey({
      filePath: displayPath,
      isLoading: fileQuery.isLoading,
      mode: effectiveMode,
      renderer,
    });
    if (!viewport || restoreKey === null || restoredScrollKeyRef.current === restoreKey) {
      return;
    }

    viewport.scrollTop = initialScrollTop;
    restoredScrollKeyRef.current = restoreKey;
  }, [displayPath, effectiveMode, fileQuery.isLoading, initialScrollTop, renderer]);

  const handleSave = useCallback(async () => {
    if (textContent === null) {
      return;
    }

    if (
      conflictDiskContent !== null &&
      !window.confirm(
        `"${workspaceFileBasename(displayPath)}" changed on disk. Save anyway and overwrite the newer disk version?`,
      )
    ) {
      return;
    }

    setSaveError(null);

    try {
      const result = await writeWorkspaceFile(workspaceId, displayPath, draftContent);
      const nextContent = result.content ?? draftContent;
      onSessionStateChange?.({
        conflictDiskContent: null,
        draftContent: nextContent,
        savedContent: nextContent,
      });
      await fileQuery.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [
    conflictDiskContent,
    displayPath,
    draftContent,
    fileQuery,
    onSessionStateChange,
    textContent,
    workspaceId,
  ]);

  useShortcutRegistration({
    allowInEditable: true,
    enabled: textContent !== null,
    handler: () => {
      void handleSave();
    },
    id: "file.save",
    priority: SHORTCUT_HANDLER_PRIORITY.file,
  });

  const handleReload = async () => {
    setSaveError(null);

    if (isDirty && conflictDiskContent === null) {
      onSessionStateChange?.({
        conflictDiskContent: null,
        draftContent: savedContent,
        savedContent,
      });
      return;
    }

    await fileQuery.refresh();
  };

  const handleLoadDiskVersion = () => {
    const nextDiskContent = conflictDiskContent ?? textContent;
    if (nextDiskContent === null) {
      return;
    }

    onSessionStateChange?.({
      conflictDiskContent: null,
      draftContent: nextDiskContent,
      savedContent: nextDiskContent,
    });
  };

  const handleModeChange = (nextMode: FileViewerMode) => {
    const resolvedNextMode = supportsViewMode ? nextMode : "edit";
    setMode(resolvedNextMode);
    onModeChange?.(resolvedNextMode);
  };

  const handleViewportScroll = (scrollTop: number) => {
    if (effectiveMode !== "view") {
      return;
    }

    onScrollTopChange?.(scrollTop);
  };

  let content;
  const RendererView = rendererDefinition.ViewComponent;

  if (fileQuery.isLoading) {
    content = (
      <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
        Loading file...
      </div>
    );
  } else if (fileQuery.error) {
    content = (
      <Alert className="m-5" variant="destructive">
        <AlertDescription>Failed to load file: {String(fileQuery.error)}</AlertDescription>
      </Alert>
    );
  } else if (!fileQuery.data) {
    content = (
      <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
        File unavailable.
      </div>
    );
  } else if (fileQuery.data.is_too_large) {
    content = (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          description={`This file is ${Intl.NumberFormat().format(fileQuery.data.byte_len)} bytes. Lifecycle currently previews text files up to 1 MB inline.`}
          icon={<FileText />}
          size="sm"
          title="File too large to preview"
        />
      </div>
    );
  } else if (fileQuery.data.is_binary || fileQuery.data.content === null) {
    content = (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          description="This file does not look like UTF-8 text, so Lifecycle is leaving it to your default app for now."
          icon={<FileText />}
          size="sm"
          title="Binary preview unavailable"
        />
      </div>
    );
  } else if (effectiveMode === "edit") {
    content = (
      <div className="min-h-0 flex-1 overflow-hidden">
        <FileCodeEditor
          config={editorConfig}
          onChange={(value) => {
            onSessionStateChange?.({
              conflictDiskContent,
              draftContent: value,
              savedContent: sessionState?.savedContent ?? textContent ?? value,
            });
          }}
          value={draftContent}
        />
      </div>
    );
  } else if (RendererView) {
    content = (
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            {rendererDefinition.viewFallbackLabel ?? "Loading file preview..."}
          </div>
        }
      >
        <RendererView content={fileQuery.data.content} filePath={displayPath} />
      </Suspense>
    );
  } else {
    content = (
      <FileCodeEditor
        config={editorConfig}
        onChange={(value) => {
          onSessionStateChange?.({
            conflictDiskContent,
            draftContent: value,
            savedContent: sessionState?.savedContent ?? textContent ?? value,
          });
        }}
        value={draftContent}
      />
    );
  }

  return (
    <div
      ref={viewportRef}
      className={`relative flex min-h-0 flex-1 flex-col bg-[var(--surface)] ${effectiveMode === "view" ? "overflow-auto" : "overflow-hidden"}`}
      onScroll={(event) => {
        handleViewportScroll(event.currentTarget.scrollTop);
      }}
    >
      {saveError ? (
        <Alert className="m-2" variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      {conflictDiskContent !== null ? (
        <Alert className="m-2" variant="destructive">
          <AlertDescription>
            This file changed on disk while you had unsaved edits open. Keep editing and save to
            overwrite, or reload the newer disk version.
          </AlertDescription>
          <AlertAction onClick={handleLoadDiskVersion}>Load Disk Version</AlertAction>
        </Alert>
      ) : null}
      {rendererDefinition.editNotice && effectiveMode === "edit" ? (
        <Alert className="m-2">
          <AlertDescription>{rendererDefinition.editNotice}</AlertDescription>
        </Alert>
      ) : null}
      {content}
      {supportsViewMode && textContent !== null ? (
        <FloatingToggle
          ariaLabel="File mode"
          onValueChange={handleModeChange}
          options={[
            {
              ariaLabel: "View file",
              content: "View",
              itemClassName: "min-w-14 px-3 py-2",
              title: "View rendered file",
              value: "view",
            },
            {
              ariaLabel: "Edit file",
              content: "Edit",
              itemClassName: "min-w-14 px-3 py-2",
              title: "Edit file source",
              value: "edit",
            },
          ]}
          value={effectiveMode}
        />
      ) : null}
    </div>
  );
}
