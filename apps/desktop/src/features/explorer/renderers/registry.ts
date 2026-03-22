import { workspaceFileExtension } from "@/features/workspaces/lib/workspace-file-paths";
import { markdownFileRenderer } from "@/features/explorer/renderers/markdown-file-renderer";
import { pencilFileRenderer } from "@/features/explorer/renderers/pencil-file-renderer";
import { textFileRenderer } from "@/features/explorer/renderers/text-file-renderer";
import type { FileRendererDefinition, FileViewerRendererKind } from "@/features/explorer/renderers/file-renderer-types";

const fileRendererRegistry: FileRendererDefinition[] = [
  markdownFileRenderer,
  pencilFileRenderer,
  textFileRenderer,
];

export function listFileRenderers(): FileRendererDefinition[] {
  return fileRendererRegistry;
}

export function resolveFileRendererDefinition(filePath: string): FileRendererDefinition {
  const extension = workspaceFileExtension(filePath) ?? "";

  for (const renderer of fileRendererRegistry) {
    if (renderer.extensions.includes(extension)) {
      return renderer;
    }
  }

  return textFileRenderer;
}

export function getFileRendererDefinitionByKind(
  kind: FileViewerRendererKind,
): FileRendererDefinition {
  return fileRendererRegistry.find((renderer) => renderer.kind === kind) ?? textFileRenderer;
}
