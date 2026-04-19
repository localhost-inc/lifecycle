import { describe, expect, test } from "bun:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ScrollBoxRenderable } from "@opentui/core";

import { WorkspaceShellPanel } from "./workspace-shell-panel";
import { defaultTuiTheme } from "../tui-theme";

describe("workspace shell panel", () => {
  test("renders the terminal canvas in a scrollbox", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceShellPanel, {
        canvasCols: 80,
        canvasRows: 24,
        focus: "canvas",
        hasSelectedWorkspace: true,
        onCanvasMouseDown: () => {},
        onCanvasMouseScroll: () => {},
        shellError: null,
        terminalAnsi: "hello\nworld\nprompt$ ",
        terminalPlaceholder: "Waiting for terminal output...",
        terminalRenderRows: 40,
        terminalScrollRef: createRef<ScrollBoxRenderable | null>(),
        theme: defaultTuiTheme,
      }),
    );

    expect(markup).toContain("<scrollbox");
    expect(markup).toContain("<ghostty-terminal");
  });
});
