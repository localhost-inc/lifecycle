import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GIT_DIFF_STYLE_STORAGE_KEY } from "@/features/git/lib/diff-style";
import { GitPatchViewer } from "@/features/git/components/git-patch-viewer";

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
  test("stretches the loading state to the full viewer height", () => {
    const markup = withWindowStorage({}, () =>
      renderViewer(
        createElement(GitPatchViewer, {
          error: null,
          errorMessagePrefix: "Failed to load diff",
          isLoading: true,
          loadingMessage: "Loading diff...",
          parsedFiles: [],
          patch: "",
        }),
      ),
    );

    expect(markup).toContain('data-slot="git-patch-viewer-content"');
    expect(markup).toContain('class="flex min-h-0 flex-1 flex-col"');
    expect(markup).toContain("min-h-0 h-full py-0");
    expect(markup).toContain("Loading diff...");
  });

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

    expect(markup).toMatch(
      /<button[^>]*aria-label="Split"[^>]*aria-pressed="false"[\s\S]*?<span[^>]*>Split<\/span><\/button>/,
    );
    expect(markup).toMatch(
      /<button[^>]*aria-label="Unified"[^>]*aria-pressed="true"[\s\S]*?<span[^>]*>Unified<\/span><\/button>/,
    );
  });

  test("surfaces parsed patch failures instead of falling back to raw rendering", () => {
    const markup = withWindowStorage({}, () =>
      renderViewer(
        createElement(GitPatchViewer, {
          error: null,
          errorMessagePrefix: "Failed to load diff",
          isLoading: false,
          loadingMessage: "Loading diff...",
          parsedFiles: null,
          patch: "diff --git a/file.txt b/file.txt",
        }),
      ),
    );

    expect(markup).toContain("Failed to parse diff: Unable to parse diff patch.");
  });
});
