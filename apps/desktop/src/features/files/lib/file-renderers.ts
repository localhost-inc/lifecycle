import {
  getFileRendererDefinitionByKind,
  resolveFileRendererDefinition,
} from "../renderers/registry";
import type { FileViewerMode } from "./file-view-mode";
import type { FileViewerRendererKind } from "../renderers/file-renderer-types";

type FileSaveHotkeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "shiftKey"
>;

export function resolveFileViewerRenderer(filePath: string): FileViewerRendererKind {
  return resolveFileRendererDefinition(filePath).kind;
}

export function supportsFileViewerViewMode(renderer: FileViewerRendererKind): boolean {
  return getFileRendererDefinitionByKind(renderer).supportsViewMode;
}

export function resolveInitialFileViewerMode(
  filePath: string,
  requestedMode?: FileViewerMode,
): FileViewerMode {
  if (resolveFileRendererDefinition(filePath).supportsViewMode) {
    return requestedMode === "edit" ? "edit" : "view";
  }

  return "edit";
}

export function getFileViewerScrollRestoreKey({
  filePath,
  isLoading,
  mode,
  renderer,
}: {
  filePath: string;
  isLoading: boolean;
  mode: FileViewerMode;
  renderer: FileViewerRendererKind;
}): string | null {
  return isLoading || mode === "edit" ? null : `${mode}:${renderer}:${filePath}`;
}

export function readFileSaveHotkey(event: FileSaveHotkeyEvent, macPlatform: boolean): boolean {
  if (event.defaultPrevented || event.shiftKey || event.altKey) {
    return false;
  }

  const isSaveKey = event.code === "KeyS" || event.key.toLowerCase() === "s";
  const hasMod = macPlatform ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;

  return hasMod && isSaveKey;
}
