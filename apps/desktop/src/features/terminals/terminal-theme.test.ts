import { afterEach, describe, expect, test } from "bun:test";
import { buildTerminalTheme, readTerminalThemeTokens } from "./terminal-theme";

const originalGetComputedStyle = globalThis.getComputedStyle;

afterEach(() => {
  globalThis.getComputedStyle = originalGetComputedStyle;
});

describe("buildTerminalTheme", () => {
  test("resolves aliased terminal background tokens before syncing native terminals", () => {
    globalThis.getComputedStyle = ((_: Element) =>
      ({
        getPropertyValue(name: string) {
          switch (name) {
            case "--terminal-surface-background":
              return "var(--surface)";
            case "--terminal-foreground":
              return "#111111";
            case "--surface":
              return "#f5f5f3";
            case "--foreground":
              return "#111111";
            case "--surface-selected":
              return "#ecece9";
            default:
              return "";
          }
        },
      }) as CSSStyleDeclaration) as typeof getComputedStyle;

    const tokens = readTerminalThemeTokens({} as HTMLElement, "light");

    expect(tokens.background).toBe("#f5f5f3");
    expect(tokens.foreground).toBe("#111111");
  });

  test("reads the dedicated terminal surface token before the page background", () => {
    globalThis.getComputedStyle = ((_: Element) =>
      ({
        getPropertyValue(name: string) {
          switch (name) {
            case "--terminal-surface-background":
              return "#09090b";
            case "--terminal-foreground":
              return "#f4f4f5";
            case "--surface":
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

    expect(tokens.background).toBe("#09090b");
    expect(tokens.foreground).toBe("#f4f4f5");
    expect(tokens.selectionBackground).toBe("#27272a");
  });

  test("reads terminal ansi palette overrides from theme tokens", () => {
    globalThis.getComputedStyle = ((_: Element) =>
      ({
        getPropertyValue(name: string) {
          switch (name) {
            case "--terminal-surface-background":
              return "#272822";
            case "--terminal-foreground":
              return "#f8f8f2";
            case "--foreground":
              return "#f8f8f2";
            case "--surface-selected":
              return "#49483e";
            case "--terminal-ansi-black":
              return "#403e41";
            case "--terminal-ansi-white":
              return "#ccccc6";
            case "--terminal-ansi-bright-black":
              return "#75715e";
            case "--terminal-ansi-bright-white":
              return "#f8f8f2";
            case "--terminal-cursor-color":
              return "#66d9ef";
            default:
              return "";
          }
        },
      }) as CSSStyleDeclaration) as typeof getComputedStyle;

    const tokens = readTerminalThemeTokens({} as HTMLElement, "monokai");
    const theme = buildTerminalTheme("monokai", tokens);

    expect(tokens.foreground).toBe("#f8f8f2");
    expect(tokens.paletteOverrides?.black).toBe("#403e41");
    expect(tokens.paletteOverrides?.white).toBe("#ccccc6");
    expect(tokens.paletteOverrides?.brightBlack).toBe("#75715e");
    expect(tokens.paletteOverrides?.brightWhite).toBe("#f8f8f2");
    expect(tokens.paletteOverrides?.cursor).toBe("#66d9ef");
    expect(theme.palette[0]).toBe("#403e41");
    expect(theme.palette[7]).toBe("#ccccc6");
    expect(theme.palette[8]).toBe("#75715e");
    expect(theme.palette[15]).toBe("#f8f8f2");
    expect(theme.cursorColor).toBe("#66d9ef");
  });

  test("keeps the terminal surface aligned with the app background tokens", () => {
    const theme = buildTerminalTheme("dark", {
      background: "#111113",
      foreground: "#fafaf9",
      selectionBackground: "#27272a",
      selectionForeground: "#fafaf9",
    });

    expect(theme).toEqual({
      background: "#111113",
      cursorColor: "#87b2cf",
      foreground: "#fafaf9",
      palette: [
        "#322d28",
        "#de7474",
        "#83b86f",
        "#c9aa5f",
        "#6f9dbc",
        "#b393d8",
        "#72b9b6",
        "#ddd6cf",
        "#8f867c",
        "#eb8a84",
        "#9ccc85",
        "#d9bd76",
        "#87b2cf",
        "#c6a8e4",
        "#8acbc7",
        "#fafaf9",
      ],
      selectionBackground: "#27272a",
      selectionForeground: "#fafaf9",
    });
  });

  test("CSS-defined themes override the appearance base palette", () => {
    const theme = buildTerminalTheme("dracula", {
      background: "#282a36",
      foreground: "#f8f8f2",
      selectionBackground: "#44475a",
      selectionForeground: "#f8f8f2",
      paletteOverrides: {
        black: "#21222c",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#bd93f9",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#f8f8f2",
        brightBlack: "#6272a4",
        brightRed: "#ff6e6e",
        brightGreen: "#69ff94",
        brightYellow: "#ffffa5",
        brightBlue: "#d6acff",
        brightMagenta: "#ff92df",
        brightCyan: "#a4ffff",
        brightWhite: "#ffffff",
        cursor: "#f8f8f2",
      },
    });

    expect(theme.cursorColor).toBe("#f8f8f2");
    expect(theme.palette[0]).toBe("#21222c");
    expect(theme.palette[1]).toBe("#ff5555");
    expect(theme.palette[2]).toBe("#50fa7b");
    expect(theme.palette[4]).toBe("#bd93f9");
  });

  test("uses theme-specific ansi colors for alternate themes", () => {
    const theme = buildTerminalTheme("nord", {
      background: "#2e3440",
      foreground: "#eceff4",
      selectionBackground: "#4c566a",
      selectionForeground: "#eceff4",
      paletteOverrides: {
        black: "#3b4252",
        red: "#bf616a",
        green: "#a3be8c",
        yellow: "#ebcb8b",
        blue: "#81a1c1",
        magenta: "#b48ead",
        cyan: "#88c0d0",
        white: "#e5e9f0",
        brightBlack: "#4c566a",
        brightRed: "#d08770",
        brightGreen: "#b5d7a7",
        brightYellow: "#f0d399",
        brightBlue: "#88c0d0",
        brightMagenta: "#c895bf",
        brightCyan: "#8fbcbb",
        brightWhite: "#eceff4",
        cursor: "#88c0d0",
      },
    });

    expect(theme.cursorColor).toBe("#88c0d0");
    expect(theme.palette[4]).toBe("#81a1c1");
    expect(theme.palette[15]).toBe("#eceff4");
  });
});
