import {
  getFileRendererDefinitionByKind,
  resolveFileRendererDefinition,
} from "@/features/editor/renderers/registry";
import type { FileEditorMode } from "@/features/editor/lib/file-editor-mode";
import type { FileEditorRendererKind } from "@/features/editor/renderers/file-editor-renderer-types";

type FileSaveHotkeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "shiftKey"
>;

export function resolveFileEditorRenderer(filePath: string): FileEditorRendererKind {
  return resolveFileRendererDefinition(filePath).kind;
}

export function supportsFileEditorViewMode(renderer: FileEditorRendererKind): boolean {
  return getFileRendererDefinitionByKind(renderer).supportsViewMode;
}

export function resolveInitialFileEditorMode(
  filePath: string,
  requestedMode?: FileEditorMode,
): FileEditorMode {
  if (resolveFileRendererDefinition(filePath).supportsViewMode) {
    return requestedMode === "edit" ? "edit" : "view";
  }

  return "edit";
}

export function getFileEditorScrollRestoreKey({
  filePath,
  isLoading,
  mode,
  renderer,
}: {
  filePath: string;
  isLoading: boolean;
  mode: FileEditorMode;
  renderer: FileEditorRendererKind;
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
