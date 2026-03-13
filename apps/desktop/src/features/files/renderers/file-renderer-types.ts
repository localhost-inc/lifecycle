import type { ComponentType, LazyExoticComponent } from "react";
import type { FileRendererEditorConfig } from "../lib/file-editor-types";

export type FileViewerRendererKind = "markdown" | "pencil" | "text";

export interface FileRendererViewProps {
  content: string;
  filePath: string;
}

type FileRendererViewComponent =
  | ComponentType<FileRendererViewProps>
  | LazyExoticComponent<ComponentType<FileRendererViewProps>>;

export interface FileRendererDefinition {
  editor?: FileRendererEditorConfig;
  editNotice?: string;
  extensions: string[];
  kind: FileViewerRendererKind;
  label: string;
  supportsViewMode: boolean;
  viewFallbackLabel?: string;
  ViewComponent?: FileRendererViewComponent;
}
