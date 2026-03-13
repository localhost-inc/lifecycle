export type FileEditorLanguage =
  | "plain-text"
  | "markdown"
  | "json"
  | "javascript"
  | "javascript-jsx"
  | "typescript"
  | "typescript-tsx"
  | "css"
  | "html"
  | "xml"
  | "rust";

export interface FileEditorConfig {
  language: FileEditorLanguage;
  lineWrapping: boolean;
}

export type FileRendererEditorConfig = Partial<FileEditorConfig>;
