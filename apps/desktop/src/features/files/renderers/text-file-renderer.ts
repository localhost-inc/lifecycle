import type { FileRendererDefinition } from "@/features/files/renderers/file-renderer-types";

export const textFileRenderer: FileRendererDefinition = {
  extensions: [],
  kind: "text",
  label: "Plain Text",
  supportsViewMode: false,
};
