import { themeAppearance, type ResolvedTheme } from "@lifecycle/ui";
import type { NativeTerminalTheme } from "./native-surface-api";

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

const ANSI_PALETTES: Partial<Record<ResolvedTheme, TerminalAnsiPalette>> &
  Record<"light" | "dark", TerminalAnsiPalette> = {
  dark: {
    black: "#322d28",
    red: "#de7474",
    green: "#83b86f",
    yellow: "#c9aa5f",
    blue: "#6f9dbc",
    magenta: "#b393d8",
    cyan: "#7caec8",
    white: "#ddd6cf",
    brightBlack: "#8f867c",
    brightRed: "#eb8a84",
    brightGreen: "#9ccc85",
    brightYellow: "#d9bd76",
    brightBlue: "#87b2cf",
    brightMagenta: "#c6a8e4",
    brightCyan: "#95c2dd",
    brightWhite: "#fafaf9",
    cursor: "#87b2cf",
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
  "github-dark": {
    black: "#484f58",
    red: "#ff7b72",
    green: "#3fb950",
    yellow: "#d29922",
    blue: "#58a6ff",
    magenta: "#bc8cff",
    cyan: "#39c5cf",
    white: "#b1bac4",
    brightBlack: "#6e7681",
    brightRed: "#ffa198",
    brightGreen: "#56d364",
    brightYellow: "#e3b341",
    brightBlue: "#79c0ff",
    brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd",
    brightWhite: "#ffffff",
    cursor: "#2f81f7",
  },
  "github-light": {
    black: "#24292f",
    red: "#cf222e",
    green: "#116329",
    yellow: "#4d2d00",
    blue: "#0969da",
    magenta: "#8250df",
    cyan: "#1b7c83",
    white: "#6e7781",
    brightBlack: "#57606a",
    brightRed: "#a40e26",
    brightGreen: "#1a7f37",
    brightYellow: "#633c01",
    brightBlue: "#218bff",
    brightMagenta: "#a475f9",
    brightCyan: "#3192aa",
    brightWhite: "#8c959f",
    cursor: "#0969da",
  },
};

function readToken(styles: CSSStyleDeclaration, token: string, fallback: string): string {
  const value = styles.getPropertyValue(token).trim();
  return resolveTokenValue(styles, value, fallback);
}

function readOptionalToken(styles: CSSStyleDeclaration, token: string): string | undefined {
  const value = styles.getPropertyValue(token).trim();
  if (!value) {
    return undefined;
  }

  return resolveTokenValue(styles, value, value);
}

function resolveTokenValue(
  styles: CSSStyleDeclaration,
  value: string,
  fallback: string,
  seen: Set<string> = new Set(),
): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return fallback;
  }

  const variableReference = /^var\((--[^),\s]+)(?:,\s*(.+))?\)$/.exec(trimmedValue);
  if (!variableReference) {
    return trimmedValue;
  }

  const [, referencedToken, inlineFallback] = variableReference;
  const resolvedInlineFallback = inlineFallback
    ? resolveTokenValue(styles, inlineFallback.trim(), fallback, new Set(seen))
    : fallback;

  if (!referencedToken || seen.has(referencedToken)) {
    return resolvedInlineFallback;
  }

  const nextSeen = new Set(seen);
  nextSeen.add(referencedToken);

  const referencedValue = styles.getPropertyValue(referencedToken).trim();
  if (!referencedValue) {
    return resolvedInlineFallback;
  }

  return resolveTokenValue(styles, referencedValue, resolvedInlineFallback, nextSeen);
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
      readToken(styles, "--surface", readToken(styles, "--background", fallback.background)),
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
): NativeTerminalTheme {
  const basePalette = ANSI_PALETTES[resolvedTheme] ?? ANSI_PALETTES[themeAppearance(resolvedTheme)];
  const palette = {
    ...basePalette,
    ...tokens.paletteOverrides,
  };

  return {
    background: tokens.background,
    cursorColor: palette.cursor,
    foreground: tokens.foreground,
    palette: paletteToList(palette),
    selectionBackground: tokens.selectionBackground,
    selectionForeground: tokens.selectionForeground,
  };
}

export function resolveTerminalTheme(
  element: HTMLElement,
  resolvedTheme: ResolvedTheme,
): NativeTerminalTheme {
  return buildTerminalTheme(resolvedTheme, readTerminalThemeTokens(element, resolvedTheme));
}
