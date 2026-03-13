import type { FileRendererDefinition } from "./file-renderer-types";

export const textFileRenderer: FileRendererDefinition = {
  extensions: [],
  kind: "text",
  label: "Plain Text",
  supportsViewMode: false,
};
