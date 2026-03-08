import { themeAppearance, type ResolvedTheme } from "@lifecycle/ui";
import type { ITheme } from "ghostty-web";
import type { NativeTerminalTheme } from "./api";

interface TerminalThemeTokens {
  background: string;
  foreground: string;
  selectionBackground: string;
  selectionForeground: string;
  paletteOverrides?: Partial<TerminalAnsiPalette>;
}

interface TerminalAnsiPalette {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
  cursor: string;
}

export interface ResolvedTerminalTheme {
  nativeTheme: NativeTerminalTheme;
  webTheme: ITheme;
}

const TOKEN_FALLBACKS: Record<"light" | "dark", TerminalThemeTokens> = {
  dark: {
    background: "#111113",
    foreground: "#fafaf9",
    selectionBackground: "#27272a",
    selectionForeground: "#fafaf9",
  },
  light: {
    background: "#f4f4f5",
    foreground: "#09090b",
    selectionBackground: "#e4e4e7",
    selectionForeground: "#09090b",
  },
};

const ANSI_PALETTES: Record<ResolvedTheme, TerminalAnsiPalette> = {
  dark: {
    black: "#27272a",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#f59e0b",
    blue: "#60a5fa",
    magenta: "#a78bfa",
    cyan: "#22d3ee",
    white: "#d4d4d8",
    brightBlack: "#71717a",
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#fbbf24",
    brightBlue: "#93c5fd",
    brightMagenta: "#c4b5fd",
    brightCyan: "#67e8f9",
    brightWhite: "#fafaf9",
    cursor: "#93c5fd",
  },
  light: {
    black: "#e4e4e7",
    red: "#dc2626",
    green: "#15803d",
    yellow: "#a16207",
    blue: "#2563eb",
    magenta: "#7c3aed",
    cyan: "#0f766e",
    white: "#52525b",
    brightBlack: "#a1a1aa",
    brightRed: "#ef4444",
    brightGreen: "#16a34a",
    brightYellow: "#ca8a04",
    brightBlue: "#3b82f6",
    brightMagenta: "#8b5cf6",
    brightCyan: "#14b8a6",
    brightWhite: "#09090b",
    cursor: "#2563eb",
  },
  "monokai-dark": {
    black: "#403e41",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#e6db74",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#ccccc6",
    brightBlack: "#75715e",
    brightRed: "#ff6188",
    brightGreen: "#bef264",
    brightYellow: "#ffd866",
    brightBlue: "#78dce8",
    brightMagenta: "#c4a7ff",
    brightCyan: "#b8f2e6",
    brightWhite: "#f8f8f2",
    cursor: "#66d9ef",
  },
  "monokai-light": {
    black: "#d8d1c1",
    red: "#d73a49",
    green: "#3f7d20",
    yellow: "#8f6a0b",
    blue: "#0f75bc",
    magenta: "#8a4fff",
    cyan: "#0f8b8d",
    white: "#5b5a54",
    brightBlack: "#b8b09e",
    brightRed: "#ef476f",
    brightGreen: "#4d9f3a",
    brightYellow: "#b8850b",
    brightBlue: "#2b8fdc",
    brightMagenta: "#a26bff",
    brightCyan: "#14b8a6",
    brightWhite: "#272822",
    cursor: "#0f75bc",
  },
  "nord-dark": {
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
  "nord-light": {
    black: "#c5cedb",
    red: "#bf616a",
    green: "#5e815b",
    yellow: "#b48a2d",
    blue: "#5e81ac",
    magenta: "#8f6f93",
    cyan: "#5f8f95",
    white: "#4c566a",
    brightBlack: "#81a1c1",
    brightRed: "#d08770",
    brightGreen: "#81a06b",
    brightYellow: "#c89f3d",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#88c0d0",
    brightWhite: "#2e3440",
    cursor: "#5e81ac",
  },
};

function readToken(styles: CSSStyleDeclaration, token: string, fallback: string): string {
  const value = styles.getPropertyValue(token).trim();
  return value || fallback;
}

function readOptionalToken(styles: CSSStyleDeclaration, token: string): string | undefined {
  const value = styles.getPropertyValue(token).trim();
  return value || undefined;
}

function readTerminalPaletteOverrides(styles: CSSStyleDeclaration): Partial<TerminalAnsiPalette> {
  const paletteOverrides: Partial<TerminalAnsiPalette> = {};

  const assignOverride = (key: keyof TerminalAnsiPalette, token: string) => {
    const value = readOptionalToken(styles, token);
    if (value) {
      paletteOverrides[key] = value;
    }
  };

  assignOverride("black", "--terminal-ansi-black");
  assignOverride("red", "--terminal-ansi-red");
  assignOverride("green", "--terminal-ansi-green");
  assignOverride("yellow", "--terminal-ansi-yellow");
  assignOverride("blue", "--terminal-ansi-blue");
  assignOverride("magenta", "--terminal-ansi-magenta");
  assignOverride("cyan", "--terminal-ansi-cyan");
  assignOverride("white", "--terminal-ansi-white");
  assignOverride("brightBlack", "--terminal-ansi-bright-black");
  assignOverride("brightRed", "--terminal-ansi-bright-red");
  assignOverride("brightGreen", "--terminal-ansi-bright-green");
  assignOverride("brightYellow", "--terminal-ansi-bright-yellow");
  assignOverride("brightBlue", "--terminal-ansi-bright-blue");
  assignOverride("brightMagenta", "--terminal-ansi-bright-magenta");
  assignOverride("brightCyan", "--terminal-ansi-bright-cyan");
  assignOverride("brightWhite", "--terminal-ansi-bright-white");
  assignOverride("cursor", "--terminal-cursor-color");

  return paletteOverrides;
}

function paletteToList(palette: TerminalAnsiPalette): string[] {
  return [
    palette.black,
    palette.red,
    palette.green,
    palette.yellow,
    palette.blue,
    palette.magenta,
    palette.cyan,
    palette.white,
    palette.brightBlack,
    palette.brightRed,
    palette.brightGreen,
    palette.brightYellow,
    palette.brightBlue,
    palette.brightMagenta,
    palette.brightCyan,
    palette.brightWhite,
  ];
}

export function readTerminalThemeTokens(
  element: HTMLElement,
  resolvedTheme: ResolvedTheme,
): TerminalThemeTokens {
  const styles = getComputedStyle(element);
  const appearance = themeAppearance(resolvedTheme);
  const fallback = TOKEN_FALLBACKS[appearance];
  return {
    background: readToken(
      styles,
      "--terminal-surface-background",
      readToken(styles, "--background", fallback.background),
    ),
    foreground: readToken(
      styles,
      "--terminal-foreground",
      readToken(styles, "--foreground", fallback.foreground),
    ),
    selectionBackground: readToken(styles, "--surface-selected", fallback.selectionBackground),
    selectionForeground: readToken(styles, "--foreground", fallback.selectionForeground),
    paletteOverrides: readTerminalPaletteOverrides(styles),
  };
}

export function buildTerminalTheme(
  resolvedTheme: ResolvedTheme,
  tokens: TerminalThemeTokens,
): ResolvedTerminalTheme {
  const palette = {
    ...ANSI_PALETTES[resolvedTheme],
    ...tokens.paletteOverrides,
  };
  return {
    nativeTheme: {
      background: tokens.background,
      cursorColor: palette.cursor,
      foreground: tokens.foreground,
      palette: paletteToList(palette),
      selectionBackground: tokens.selectionBackground,
      selectionForeground: tokens.selectionForeground,
    },
    webTheme: {
      background: tokens.background,
      black: palette.black,
      blue: palette.blue,
      brightBlack: palette.brightBlack,
      brightBlue: palette.brightBlue,
      brightCyan: palette.brightCyan,
      brightGreen: palette.brightGreen,
      brightMagenta: palette.brightMagenta,
      brightRed: palette.brightRed,
      brightWhite: palette.brightWhite,
      brightYellow: palette.brightYellow,
      cursor: palette.cursor,
      cursorAccent: tokens.background,
      cyan: palette.cyan,
      foreground: tokens.foreground,
      green: palette.green,
      magenta: palette.magenta,
      red: palette.red,
      selectionBackground: tokens.selectionBackground,
      white: palette.white,
      yellow: palette.yellow,
    },
  };
}

export function resolveTerminalTheme(
  element: HTMLElement,
  resolvedTheme: ResolvedTheme,
): ResolvedTerminalTheme {
  return buildTerminalTheme(resolvedTheme, readTerminalThemeTokens(element, resolvedTheme));
}
