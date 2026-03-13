import { lazy } from "react";
import type { FileRendererDefinition } from "./file-renderer-types";

const MarkdownFileRendererView = lazy(async () => {
  const module = await import("./markdown-file-renderer-view");
  return { default: module.MarkdownFileRendererView };
});

export const markdownFileRenderer: FileRendererDefinition = {
  editor: {
    language: "markdown",
    lineWrapping: true,
  },
  extensions: ["md"],
  kind: "markdown",
  label: "Markdown",
  supportsViewMode: true,
  viewFallbackLabel: "Loading markdown preview...",
  ViewComponent: MarkdownFileRendererView,
};
