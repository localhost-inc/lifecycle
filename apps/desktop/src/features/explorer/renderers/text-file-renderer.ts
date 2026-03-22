import type { FileRendererDefinition } from "@/features/explorer/renderers/file-renderer-types";

export const textFileRenderer: FileRendererDefinition = {
  extensions: [],
  kind: "text",
  label: "Plain Text",
  supportsViewMode: false,
};
