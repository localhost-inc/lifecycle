import type { ComponentType, LazyExoticComponent } from "react";
import type { FileRendererEditorConfig } from "@/features/editor/lib/file-editor-types";

export type FileEditorRendererKind = "markdown" | "pencil" | "text";

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
  kind: FileEditorRendererKind;
  label: string;
  supportsViewMode: boolean;
  viewFallbackLabel?: string;
  ViewComponent?: FileRendererViewComponent;
}
