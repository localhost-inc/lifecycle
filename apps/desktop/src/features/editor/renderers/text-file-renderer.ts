import type { FileRendererDefinition } from "@/features/editor/renderers/file-editor-renderer-types";

export const textFileRenderer: FileRendererDefinition = {
  extensions: [],
  kind: "text",
  label: "Plain Text",
  supportsViewMode: false,
};
