import { afterEach, describe, expect, test } from "bun:test";
import { buildTerminalTheme, readTerminalThemeTokens } from "./terminal-theme";

const originalGetComputedStyle = globalThis.getComputedStyle;

afterEach(() => {
  globalThis.getComputedStyle = originalGetComputedStyle;
});

describe("buildTerminalTheme", () => {
  test("reads the dedicated terminal surface token before the page background", () => {
    globalThis.getComputedStyle = ((_: Element) =>
      ({
        getPropertyValue(name: string) {
          switch (name) {
            case "--terminal-surface-background":
              return "#111113";
            case "--terminal-foreground":
              return "#f4f4f5";
            case "--panel":
              return "#141416";
            case "--foreground":
              return "#fafaf9";
            case "--surface-selected":
              return "#27272a";
            default:
              return "";
          }
        },
      }) as CSSStyleDeclaration) as typeof getComputedStyle;

    const tokens = readTerminalThemeTokens({} as HTMLElement, "dark");

    expect(tokens.background).toBe("#111113");
    expect(tokens.foreground).toBe("#f4f4f5");
    expect(tokens.selectionBackground).toBe("#27272a");
  });

  test("reads terminal ansi palette overrides from theme tokens", () => {
    globalThis.getComputedStyle = ((_: Element) =>
      ({
        getPropertyValue(name: string) {
          switch (name) {
            case "--terminal-surface-background":
              return "#f1ecde";
            case "--terminal-foreground":
              return "#5b5a54";
            case "--foreground":
              return "#272822";
            case "--surface-selected":
              return "#d8d1c1";
            case "--terminal-ansi-black":
              return "#d8d1c1";
            case "--terminal-ansi-white":
              return "#5b5a54";
            case "--terminal-ansi-bright-black":
              return "#b8b09e";
            case "--terminal-ansi-bright-white":
              return "#272822";
            case "--terminal-cursor-color":
              return "#0f75bc";
            default:
              return "";
          }
        },
      }) as CSSStyleDeclaration) as typeof getComputedStyle;

    const tokens = readTerminalThemeTokens({} as HTMLElement, "light");
    const theme = buildTerminalTheme("monokai", "light", tokens);

    expect(tokens.foreground).toBe("#5b5a54");
    expect(tokens.paletteOverrides?.black).toBe("#d8d1c1");
    expect(tokens.paletteOverrides?.white).toBe("#5b5a54");
    expect(tokens.paletteOverrides?.brightBlack).toBe("#b8b09e");
    expect(tokens.paletteOverrides?.brightWhite).toBe("#272822");
    expect(tokens.paletteOverrides?.cursor).toBe("#0f75bc");
    expect(theme.nativeTheme.palette[0]).toBe("#d8d1c1");
    expect(theme.nativeTheme.palette[7]).toBe("#5b5a54");
    expect(theme.nativeTheme.palette[8]).toBe("#b8b09e");
    expect(theme.nativeTheme.palette[15]).toBe("#272822");
    expect(theme.nativeTheme.cursorColor).toBe("#0f75bc");
  });

  test("keeps the terminal surface aligned with the app background tokens", () => {
    const theme = buildTerminalTheme("lifecycle", "dark", {
      background: "#111113",
      foreground: "#fafaf9",
      selectionBackground: "#27272a",
      selectionForeground: "#fafaf9",
    });

    expect(theme.nativeTheme).toEqual({
      background: "#111113",
      cursorColor: "#93c5fd",
      foreground: "#fafaf9",
      palette: [
        "#27272a",
        "#ef4444",
        "#22c55e",
        "#f59e0b",
        "#60a5fa",
        "#a78bfa",
        "#22d3ee",
        "#d4d4d8",
        "#71717a",
        "#f87171",
        "#4ade80",
        "#fbbf24",
        "#93c5fd",
        "#c4b5fd",
        "#67e8f9",
        "#fafaf9",
      ],
      selectionBackground: "#27272a",
      selectionForeground: "#fafaf9",
    });
    expect(theme.webTheme.background).toBe("#111113");
    expect(theme.webTheme.foreground).toBe("#fafaf9");
    expect(theme.webTheme.cursor).toBe("#93c5fd");
    expect(theme.webTheme.selectionBackground).toBe("#27272a");
  });

  test("uses preset-specific ansi colors for alternate themes", () => {
    const theme = buildTerminalTheme("nord", "light", {
      background: "#eceff4",
      foreground: "#2e3440",
      selectionBackground: "#c5cedb",
      selectionForeground: "#2e3440",
    });

    expect(theme.nativeTheme.cursorColor).toBe("#5e81ac");
    expect(theme.nativeTheme.palette[4]).toBe("#5e81ac");
    expect(theme.nativeTheme.palette[15]).toBe("#2e3440");
  });
});
