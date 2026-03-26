import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@lifecycle/ui";
import { mockStoreContext } from "@/test/store-mock";
import {
  buildFileCodeEditorExtensions,
  resolveFileEditorConfig,
} from "@/features/editor/lib/file-editor-config";
import type { FileEditorConfig } from "@/features/editor/lib/file-editor-types";
import {
  getFileEditorScrollRestoreKey,
  readFileSaveHotkey,
  resolveFileEditorRenderer,
  resolveInitialFileEditorMode,
} from "@/features/editor/lib/file-editor-renderers";
import {
  hasFileEditorConflict,
  isFileEditorDirty,
} from "@/features/editor/lib/file-editor-session";
import { resolveFileRendererDefinition } from "@/features/editor/renderers/registry";
import { MarkdownFileRendererView } from "@/features/editor/renderers/markdown-file-renderer-view";
import { summarizePencilDocument } from "@/features/editor/renderers/pencil-file-renderer";
import type { WorkspaceFileReadResult } from "@lifecycle/workspace/client";

function readyQueryResult<T>(data: T) {
  return {
    data,
    error: null,
    isLoading: false,
    refresh: async () => {},
    status: "ready" as const,
  };
}

async function renderFileEditorSurface(filePath: string, file: WorkspaceFileReadResult) {
  const hooksModule = await import("../../workspaces/hooks");
  spyOn(hooksModule, "useWorkspaceFile").mockReturnValue(readyQueryResult(file) as never);

  const { FileEditorSurface } = await import("./file-editor-surface");

  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(FileEditorSurface, {
        filePath,
        workspaceId: "workspace-1",
      }),
      storageKey: "test.theme",
    }),
  );
}

describe("FileEditorSurface helpers", () => {
  test("maps supported extensions to custom renderer kinds", () => {
    expect(resolveFileEditorRenderer("README.md")).toBe("markdown");
    expect(resolveFileEditorRenderer("design/mock.pen")).toBe("pencil");
    expect(resolveFileEditorRenderer("src/index.ts")).toBe("text");
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

  test("only restores file editor scroll after loading a specific renderer/file pair", () => {
    expect(
      getFileEditorScrollRestoreKey({
        filePath: "docs/privacy-notice.md",
        isLoading: true,
        mode: "view",
        renderer: "markdown",
      }),
    ).toBeNull();

    expect(
      getFileEditorScrollRestoreKey({
        filePath: "docs/privacy-notice.md",
        isLoading: false,
        mode: "view",
        renderer: "markdown",
      }),
    ).toBe("view:markdown:docs/privacy-notice.md");

    expect(
      getFileEditorScrollRestoreKey({
        filePath: "design/mock.pen",
        isLoading: false,
        mode: "view",
        renderer: "pencil",
      }),
    ).toBe("view:pencil:design/mock.pen");
  });

  test("defaults specialized viewers to view mode and text files to edit mode", () => {
    expect(resolveInitialFileEditorMode("README.md")).toBe("view");
    expect(resolveInitialFileEditorMode("design/mock.pen")).toBe("view");
    expect(resolveInitialFileEditorMode("src/index.ts")).toBe("edit");
  });

  test("detects dirty sessions and disk conflicts", () => {
    expect(isFileEditorDirty(null)).toBe(false);
    expect(
      isFileEditorDirty({
        conflictDiskContent: null,
        draftContent: "draft",
        savedContent: "saved",
      }),
    ).toBe(true);
    expect(
      hasFileEditorConflict({
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

describe("FileEditorSurface", () => {
  beforeEach(() => mockStoreContext());
  afterEach(() => mock.restore());

  test("renders markdown files with the markdown renderer", async () => {
    const markup = await renderFileEditorSurface("README.md", {
      absolute_path: "/tmp/workspace/README.md",
      byte_len: 31,
      content: "# Hello\n\n- first\n- second\n",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    });

    expect(markup).toContain("Loading markdown preview...");
  });

  test("renders .pen files with the pencil canvas view", async () => {
    const markup = await renderFileEditorSurface("design/mock.pen", {
      absolute_path: "/tmp/workspace/design/mock.pen",
      byte_len: 320,
      content: JSON.stringify(
        {
          version: "1.0",
          children: [
            {
              id: "root-frame",
              type: "frame",
              x: 0,
              y: 0,
              width: 200,
              height: 100,
              fill: "#111113",
              layout: "vertical",
              children: [
                { id: "heading", type: "text", content: "Mockup", fontSize: 14, fill: "#E4E4E7" },
                { id: "shape-1", type: "rectangle", width: 80, height: 20, fill: "#FF0000" },
              ],
            },
          ],
        },
        null,
        2,
      ),
      extension: "pen",
      file_path: "design/mock.pen",
      is_binary: false,
      is_too_large: false,
    });

    expect(markup).toContain("root-frame");
    expect(markup).toContain("Mockup");
    expect(markup).toContain("#111113");
    expect(markup).toContain("#FF0000");
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
