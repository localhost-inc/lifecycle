import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@lifecycle/ui";
import { FileViewer, resolveFileViewerRenderer, summarizePencilDocument } from "./file-viewer";

describe("FileViewer helpers", () => {
  test("maps supported extensions to custom renderer kinds", () => {
    expect(resolveFileViewerRenderer("README.md")).toBe("markdown");
    expect(resolveFileViewerRenderer("design/mock.pen")).toBe("pencil");
    expect(resolveFileViewerRenderer("src/index.ts")).toBe("text");
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
});

describe("FileViewer", () => {
  afterEach(() => {
    mock.restore();
  });

  test("renders markdown files with the markdown renderer", async () => {
    const hooksModule = await import("../hooks");

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

    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(FileViewer, {
          filePath: "README.md",
          workspaceId: "workspace-1",
        }),
        storageKey: "test.theme",
      }),
    );

    expect(markup).toContain("File Viewer");
    expect(markup).toContain("Markdown");
    expect(markup).toContain("<h1");
    expect(markup).toContain("Hello");
    expect(markup).toContain("first");
  });

  test("renders .pen files with the pencil summary view", async () => {
    const hooksModule = await import("../hooks");

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

    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(FileViewer, {
          filePath: "design/mock.pen",
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
