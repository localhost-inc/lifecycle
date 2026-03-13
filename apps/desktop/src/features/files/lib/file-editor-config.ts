import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { EditorView } from "@codemirror/view";
import { xml } from "@codemirror/lang-xml";
import { workspaceFileExtension } from "../../workspaces/lib/workspace-file-paths";
import type { FileRendererEditorConfig, FileEditorConfig } from "./file-editor-types";

function createBaseFileCodeEditorTheme() {
  return EditorView.theme({
    "&": {
      backgroundColor: "var(--background)",
      color: "var(--foreground)",
      fontSize: "12px",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "var(--foreground)",
      fontFamily:
        '"SF Mono", "SFMono-Regular", Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", monospace',
      minHeight: "100%",
      padding: "16px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--foreground)",
    },
    ".cm-gutters": {
      backgroundColor: "color-mix(in srgb, var(--panel), transparent 20%)",
      borderRight: "1px solid var(--border)",
      color: "var(--muted-foreground)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--surface-hover), transparent 20%)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--ring), transparent 72%)",
    },
    ".cm-panels": {
      backgroundColor: "var(--panel)",
      color: "var(--foreground)",
    },
    ".cm-scroller": {
      fontFamily:
        '"SF Mono", "SFMono-Regular", Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", monospace',
    },
  });
}

const baseFileCodeEditorTheme = createBaseFileCodeEditorTheme();

function resolveDefaultFileEditorConfig(filePath: string): FileEditorConfig {
  switch (workspaceFileExtension(filePath)) {
    case "md":
      return { language: "markdown", lineWrapping: true };
    case "json":
    case "pen":
      return { language: "json", lineWrapping: false };
    case "js":
      return { language: "javascript", lineWrapping: false };
    case "jsx":
      return { language: "javascript-jsx", lineWrapping: false };
    case "ts":
      return { language: "typescript", lineWrapping: false };
    case "tsx":
      return { language: "typescript-tsx", lineWrapping: false };
    case "css":
    case "scss":
      return { language: "css", lineWrapping: false };
    case "html":
      return { language: "html", lineWrapping: false };
    case "svg":
    case "xml":
      return { language: "xml", lineWrapping: false };
    case "rs":
      return { language: "rust", lineWrapping: false };
    case "txt":
      return { language: "plain-text", lineWrapping: true };
    default:
      return { language: "plain-text", lineWrapping: false };
  }
}

export function resolveFileEditorConfig(
  filePath: string,
  rendererConfig?: FileRendererEditorConfig,
): FileEditorConfig {
  return {
    ...resolveDefaultFileEditorConfig(filePath),
    ...rendererConfig,
  };
}

function resolveLanguageExtensions(language: FileEditorConfig["language"]) {
  switch (language) {
    case "markdown":
      return [markdown()];
    case "json":
      return [json()];
    case "javascript":
      return [javascript()];
    case "javascript-jsx":
      return [javascript({ jsx: true })];
    case "typescript":
      return [javascript({ typescript: true })];
    case "typescript-tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "css":
      return [css()];
    case "html":
      return [html()];
    case "xml":
      return [xml()];
    case "rust":
      return [rust()];
    default:
      return [];
  }
}

export function buildFileCodeEditorExtensions(config: FileEditorConfig) {
  const extensions = [baseFileCodeEditorTheme, ...resolveLanguageExtensions(config.language)];

  if (config.lineWrapping) {
    extensions.push(EditorView.lineWrapping);
  }

  return extensions;
}
