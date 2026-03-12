import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GIT_DIFF_STYLE_STORAGE_KEY } from "../lib/diff-style";
import { GitPatchViewer } from "./git-patch-viewer";

function renderViewer(node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: node,
      storageKey: "test.theme",
    }),
  );
}

function createWindowStorage(
  initialEntries: Record<string, string> = {},
): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map(Object.entries(initialEntries));

  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function withWindowStorage<T>(initialEntries: Record<string, string>, run: () => T): T {
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: () => {},
      localStorage: createWindowStorage(initialEntries),
      matchMedia: () => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: false,
        media: "",
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
      }),
      removeEventListener: () => {},
    },
    writable: true,
  });

  try {
    return run();
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
        writable: true,
      });
    }
  }
}

describe("GitPatchViewer", () => {
  test("restores the remembered diff view mode from storage", () => {
    const markup = withWindowStorage(
      {
        [GIT_DIFF_STYLE_STORAGE_KEY]: "unified",
      },
      () =>
        renderViewer(
          createElement(GitPatchViewer, {
            error: null,
            errorMessagePrefix: "Failed to load diff",
            isLoading: false,
            loadingMessage: "Loading diff...",
            parsedFiles: [],
            patch: "",
          }),
        ),
    );

    expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Split<\/button>/);
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Unified<\/button>/);
  });
});
