import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@lifecycle/ui";
import { FileSurface } from "./file-surface";
import { buildFileCodeEditorExtensions, resolveFileEditorConfig } from "../lib/file-editor-config";
import type { FileEditorConfig } from "../lib/file-editor-types";
import {
  getFileViewerScrollRestoreKey,
  readFileSaveHotkey,
  resolveFileViewerRenderer,
  resolveInitialFileViewerMode,
} from "../lib/file-renderers";
import { hasFileViewerConflict, isFileViewerDirty } from "../lib/file-session";
import { resolveFileRendererDefinition } from "../renderers/registry";
import { MarkdownFileRendererView } from "../renderers/markdown-file-renderer-view";
import { summarizePencilDocument } from "../renderers/pencil-file-renderer";

describe("FileSurface helpers", () => {
  test("maps supported extensions to custom renderer kinds", () => {
    expect(resolveFileViewerRenderer("README.md")).toBe("markdown");
    expect(resolveFileViewerRenderer("design/mock.pen")).toBe("pencil");
    expect(resolveFileViewerRenderer("src/index.ts")).toBe("text");
  });

  test("resolves renderer metadata through the shared registry", () => {
    expect(resolveFileRendererDefinition("README.md")).toMatchObject({
      kind: "markdown",
      label: "Markdown",
      supportsViewMode: true,
      viewFallbackLabel: "Loading markdown preview...",
    });
    expect(resolveFileRendererDefinition("design/mock.pen")).toMatchObject({
      kind: "pencil",
      label: "Pencil",
      supportsViewMode: true,
    });
    expect(resolveFileRendererDefinition("src/index.ts")).toMatchObject({
      kind: "text",
      label: "Plain Text",
      supportsViewMode: false,
    });
  });

  test("summarizes parsed pencil documents", () => {
    expect(
      summarizePencilDocument(
        JSON.stringify({
          name: "Landing Page",
          pages: [
            {
              id: "page-1",
              type: "page",
              children: [
                { id: "node-1", type: "text" },
                { id: "node-2", type: "text" },
                { id: "node-3", type: "frame" },
              ],
            },
          ],
          version: 3,
        }),
      ),
    ).toMatchObject({
      nodeCount: 4,
      title: "Landing Page",
      uniqueTypeCount: 3,
      version: "3",
    });
  });

  test("only restores file viewer scroll after loading a specific renderer/file pair", () => {
    expect(
      getFileViewerScrollRestoreKey({
        filePath: "docs/privacy-notice.md",
        isLoading: true,
        mode: "view",
        renderer: "markdown",
      }),
    ).toBeNull();

    expect(
      getFileViewerScrollRestoreKey({
        filePath: "docs/privacy-notice.md",
        isLoading: false,
        mode: "view",
        renderer: "markdown",
      }),
    ).toBe("view:markdown:docs/privacy-notice.md");

    expect(
      getFileViewerScrollRestoreKey({
        filePath: "design/mock.pen",
        isLoading: false,
        mode: "view",
        renderer: "pencil",
      }),
    ).toBe("view:pencil:design/mock.pen");
  });

  test("defaults specialized viewers to view mode and text files to edit mode", () => {
    expect(resolveInitialFileViewerMode("README.md")).toBe("view");
    expect(resolveInitialFileViewerMode("design/mock.pen")).toBe("view");
    expect(resolveInitialFileViewerMode("src/index.ts")).toBe("edit");
  });

  test("detects dirty sessions and disk conflicts", () => {
    expect(isFileViewerDirty(null)).toBe(false);
    expect(
      isFileViewerDirty({
        conflictDiskContent: null,
        draftContent: "draft",
        savedContent: "saved",
      }),
    ).toBe(true);
    expect(
      hasFileViewerConflict({
        conflictDiskContent: "disk",
        draftContent: "draft",
        savedContent: "saved",
      }),
    ).toBe(true);
  });

  test("reads save shortcuts for the current platform modifier", () => {
    const saveEvent = {
      altKey: false,
      code: "KeyS",
      ctrlKey: false,
      defaultPrevented: false,
      key: "s",
      metaKey: true,
      shiftKey: false,
    } as KeyboardEvent;

    expect(readFileSaveHotkey(saveEvent, true)).toBe(true);
    expect(
      readFileSaveHotkey({ ...saveEvent, metaKey: false, ctrlKey: true } as KeyboardEvent, false),
    ).toBe(true);
    expect(readFileSaveHotkey({ ...saveEvent, shiftKey: true } as KeyboardEvent, true)).toBe(false);
  });

  test("merges renderer-specific editor configuration with extension defaults", () => {
    expect(resolveFileEditorConfig("README.md")).toEqual({
      language: "markdown",
      lineWrapping: true,
    });
    expect(resolveFileEditorConfig("design/mock.pen")).toEqual({
      language: "json",
      lineWrapping: false,
    });
    expect(
      resolveFileEditorConfig("design/mock.pen", {
        lineWrapping: true,
      }),
    ).toEqual({
      language: "json",
      lineWrapping: true,
    });
  });

  test("builds CodeMirror extensions from the shared editor config", () => {
    const extensions = buildFileCodeEditorExtensions({
      language: "markdown",
      lineWrapping: true,
    } satisfies FileEditorConfig);

    expect(extensions.length).toBeGreaterThan(1);
  });
});

describe("FileSurface", () => {
  afterEach(() => {
    mock.restore();
  });

  test("renders markdown files with the markdown renderer", async () => {
    const hooksModule = await import("../../workspaces/hooks");

    spyOn(hooksModule, "useWorkspaceFile").mockReturnValue({
      data: {
        absolute_path: "/tmp/workspace/README.md",
        byte_len: 31,
        content: "# Hello\n\n- first\n- second\n",
        extension: "md",
        file_path: "README.md",
        is_binary: false,
        is_too_large: false,
      },
      error: null,
      isLoading: false,
      refresh: async () => {},
      status: "ready",
    } as never);
    spyOn(hooksModule, "useWorkspaceFileTree").mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refresh: async () => {},
      status: "ready",
    } as never);

    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(FileSurface, {
          filePath: "README.md",
          onOpenFile: () => {},
          workspaceId: "workspace-1",
        }),
        storageKey: "test.theme",
      }),
    );

    expect(markup).toContain("File Viewer");
    expect(markup).toContain("Markdown");
    expect(markup).toContain("Loading markdown preview...");
  });

  test("renders .pen files with the pencil summary view", async () => {
    const hooksModule = await import("../../workspaces/hooks");

    spyOn(hooksModule, "useWorkspaceFile").mockReturnValue({
      data: {
        absolute_path: "/tmp/workspace/design/mock.pen",
        byte_len: 180,
        content: JSON.stringify(
          {
            name: "Mockup",
            root: {
              id: "root",
              type: "page",
              children: [
                { id: "shape-1", type: "rectangle" },
                { id: "shape-2", type: "rectangle" },
                { id: "text-1", type: "text" },
              ],
            },
            version: 1,
          },
          null,
          2,
        ),
        extension: "pen",
        file_path: "design/mock.pen",
        is_binary: false,
        is_too_large: false,
      },
      error: null,
      isLoading: false,
      refresh: async () => {},
      status: "ready",
    } as never);
    spyOn(hooksModule, "useWorkspaceFileTree").mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refresh: async () => {},
      status: "ready",
    } as never);

    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(FileSurface, {
          filePath: "design/mock.pen",
          onOpenFile: () => {},
          workspaceId: "workspace-1",
        }),
        storageKey: "test.theme",
      }),
    );

    expect(markup).toContain("Pencil");
    expect(markup).toContain("Pencil document");
    expect(markup).toContain("Mockup");
    expect(markup).toContain("rectangle");
    expect(markup).toContain("Raw JSON");
  });
});

describe("MarkdownFileRendererView", () => {
  test("renders markdown content eagerly once loaded", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownFileRendererView, {
        content: "# Hello\n\n- first\n- second\n",
      }),
    );

    expect(markup).toContain("<h1");
    expect(markup).toContain("Hello");
    expect(markup).toContain("first");
    expect(markup).toContain("markdown-file-renderer");
  });
});
