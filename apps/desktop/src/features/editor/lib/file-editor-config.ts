import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { xml } from "@codemirror/lang-xml";
import { tags as t } from "@lezer/highlight";
import { workspaceFileExtension } from "@/features/workspaces/lib/workspace-file-paths";
import type {
  FileRendererEditorConfig,
  FileEditorConfig,
} from "@/features/editor/lib/file-editor-types";

function createBaseFileCodeEditorTheme() {
  return EditorView.theme({
    "&.cm-editor": {
      backgroundColor: "var(--surface)",
      color: "var(--foreground)",
      fontSize: "0.75rem",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "var(--foreground)",
      fontFamily:
        '"SF Mono", "SFMono-Regular", Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", monospace',
      minHeight: "100%",
      padding: "1rem 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--foreground)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--surface)",
      borderRight: "none",
      color: "var(--muted-foreground)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--surface-hover)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--surface-selected)",
    },
    ".cm-panels": {
      backgroundColor: "var(--surface)",
      color: "var(--foreground)",
    },
    ".cm-scroller": {
      fontFamily:
        '"SF Mono", "SFMono-Regular", Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", monospace',
    },
  });
}

const baseFileCodeEditorTheme = createBaseFileCodeEditorTheme();

const fileCodeEditorHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--muted-foreground)" },
  { tag: [t.string, t.special(t.string)], color: "var(--terminal-ansi-green)" },
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: "var(--terminal-ansi-magenta)" },
  { tag: [t.number, t.bool], color: "var(--terminal-ansi-yellow)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--terminal-ansi-blue)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--terminal-ansi-cyan)" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: "var(--terminal-ansi-yellow)",
  },
  { tag: [t.definition(t.variableName)], color: "var(--terminal-ansi-bright-blue)" },
  { tag: [t.operator, t.punctuation], color: "var(--muted-foreground)" },
  { tag: [t.tagName], color: "var(--terminal-ansi-red)" },
  { tag: [t.meta], color: "var(--terminal-ansi-bright-magenta)" },
  { tag: [t.regexp], color: "var(--terminal-ansi-bright-red)" },
  { tag: [t.atom], color: "var(--terminal-ansi-cyan)" },
]);

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
  const extensions = [
    baseFileCodeEditorTheme,
    syntaxHighlighting(fileCodeEditorHighlightStyle),
    ...resolveLanguageExtensions(config.language),
  ];

  if (config.lineWrapping) {
    extensions.push(EditorView.lineWrapping);
  }

  return extensions;
}
