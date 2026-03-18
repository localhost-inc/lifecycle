import { type ReactNode, createElement } from "react";

/**
 * Maps SGR color codes to CSS custom property names using the theme's terminal
 * ANSI palette. Supports standard (30-37, 40-47), bright (90-97, 100-107),
 * 256-color (38;5;N / 48;5;N), and true-color (38;2;R;G;B / 48;2;R;G;B).
 */

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

const FG_STANDARD: Record<number, string> = {
  30: "var(--terminal-ansi-black)",
  31: "var(--terminal-ansi-red)",
  32: "var(--terminal-ansi-green)",
  33: "var(--terminal-ansi-yellow)",
  34: "var(--terminal-ansi-blue)",
  35: "var(--terminal-ansi-magenta)",
  36: "var(--terminal-ansi-cyan)",
  37: "var(--terminal-ansi-white)",
};

const FG_BRIGHT: Record<number, string> = {
  90: "var(--terminal-ansi-bright-black)",
  91: "var(--terminal-ansi-bright-red)",
  92: "var(--terminal-ansi-bright-green)",
  93: "var(--terminal-ansi-bright-yellow)",
  94: "var(--terminal-ansi-bright-blue)",
  95: "var(--terminal-ansi-bright-magenta)",
  96: "var(--terminal-ansi-bright-cyan)",
  97: "var(--terminal-ansi-bright-white)",
};

const BG_STANDARD: Record<number, string> = {
  40: "var(--terminal-ansi-black)",
  41: "var(--terminal-ansi-red)",
  42: "var(--terminal-ansi-green)",
  43: "var(--terminal-ansi-yellow)",
  44: "var(--terminal-ansi-blue)",
  45: "var(--terminal-ansi-magenta)",
  46: "var(--terminal-ansi-cyan)",
  47: "var(--terminal-ansi-white)",
};

const BG_BRIGHT: Record<number, string> = {
  100: "var(--terminal-ansi-bright-black)",
  101: "var(--terminal-ansi-bright-red)",
  102: "var(--terminal-ansi-bright-green)",
  103: "var(--terminal-ansi-bright-yellow)",
  104: "var(--terminal-ansi-bright-blue)",
  105: "var(--terminal-ansi-bright-magenta)",
  106: "var(--terminal-ansi-bright-cyan)",
  107: "var(--terminal-ansi-bright-white)",
};

const PALETTE_256_STANDARD: string[] = [
  "var(--terminal-ansi-black)",
  "var(--terminal-ansi-red)",
  "var(--terminal-ansi-green)",
  "var(--terminal-ansi-yellow)",
  "var(--terminal-ansi-blue)",
  "var(--terminal-ansi-magenta)",
  "var(--terminal-ansi-cyan)",
  "var(--terminal-ansi-white)",
  "var(--terminal-ansi-bright-black)",
  "var(--terminal-ansi-bright-red)",
  "var(--terminal-ansi-bright-green)",
  "var(--terminal-ansi-bright-yellow)",
  "var(--terminal-ansi-bright-blue)",
  "var(--terminal-ansi-bright-magenta)",
  "var(--terminal-ansi-bright-cyan)",
  "var(--terminal-ansi-bright-white)",
];

function color256(n: number): string | null {
  if (n < 0 || n > 255) {
    return null;
  }

  if (n < 16) {
    return PALETTE_256_STANDARD[n] ?? null;
  }

  if (n < 232) {
    const index = n - 16;
    const r = Math.round((Math.floor(index / 36) * 255) / 5);
    const g = Math.round(((Math.floor(index / 6) % 6) * 255) / 5);
    const b = Math.round(((index % 6) * 255) / 5);
    return `rgb(${r},${g},${b})`;
  }

  const gray = Math.round(((n - 232) * 255) / 23);
  return `rgb(${gray},${gray},${gray})`;
}

interface AnsiStyle {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  fg: string | null;
  bg: string | null;
}

function emptyStyle(): AnsiStyle {
  return { bold: false, dim: false, italic: false, underline: false, fg: null, bg: null };
}

function applyParams(style: AnsiStyle, params: number[]): void {
  let i = 0;
  while (i < params.length) {
    const code = params[i]!;

    if (code === 0) {
      Object.assign(style, emptyStyle());
    } else if (code === 1) {
      style.bold = true;
    } else if (code === 2) {
      style.dim = true;
    } else if (code === 3) {
      style.italic = true;
    } else if (code === 4) {
      style.underline = true;
    } else if (code === 22) {
      style.bold = false;
      style.dim = false;
    } else if (code === 23) {
      style.italic = false;
    } else if (code === 24) {
      style.underline = false;
    } else if (code === 39) {
      style.fg = null;
    } else if (code === 49) {
      style.bg = null;
    } else if (FG_STANDARD[code]) {
      style.fg = FG_STANDARD[code]!;
    } else if (FG_BRIGHT[code]) {
      style.fg = FG_BRIGHT[code]!;
    } else if (BG_STANDARD[code]) {
      style.bg = BG_STANDARD[code]!;
    } else if (BG_BRIGHT[code]) {
      style.bg = BG_BRIGHT[code]!;
    } else if ((code === 38 || code === 48) && i + 1 < params.length) {
      const mode = params[i + 1];
      if (mode === 5 && i + 2 < params.length) {
        const color = color256(params[i + 2]!);
        if (color) {
          if (code === 38) style.fg = color;
          else style.bg = color;
        }
        i += 3;
        continue;
      }
      if (mode === 2 && i + 4 < params.length) {
        const r = params[i + 2]!;
        const g = params[i + 3]!;
        const b = params[i + 4]!;
        const color = `rgb(${r},${g},${b})`;
        if (code === 38) style.fg = color;
        else style.bg = color;
        i += 5;
        continue;
      }
    }

    i++;
  }
}

function styleToInline(
  style: AnsiStyle,
): Record<string, string> | null {
  const css: Record<string, string> = {};
  let hasStyle = false;

  if (style.fg) {
    css.color = style.fg;
    hasStyle = true;
  }
  if (style.bg) {
    css.backgroundColor = style.bg;
    hasStyle = true;
  }
  if (style.bold) {
    css.fontWeight = "bold";
    hasStyle = true;
  }
  if (style.dim) {
    css.opacity = "0.7";
    hasStyle = true;
  }
  if (style.italic) {
    css.fontStyle = "italic";
    hasStyle = true;
  }
  if (style.underline) {
    css.textDecoration = "underline";
    hasStyle = true;
  }

  return hasStyle ? css : null;
}

export function hasAnsiCodes(text: string): boolean {
  return text.includes("\x1b[");
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

export function renderAnsiLine(line: string, keyPrefix: string): ReactNode {
  if (!hasAnsiCodes(line)) {
    return line;
  }

  const segments: ReactNode[] = [];
  const style = emptyStyle();
  let lastIndex = 0;
  let segmentIndex = 0;

  ANSI_ESCAPE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANSI_ESCAPE_RE.exec(line)) !== null) {
    const textBefore = line.slice(lastIndex, match.index);
    if (textBefore.length > 0) {
      const inlineStyle = styleToInline(style);
      segments.push(
        inlineStyle
          ? createElement("span", { key: `${keyPrefix}-${segmentIndex}`, style: inlineStyle }, textBefore)
          : textBefore,
      );
      segmentIndex++;
    }

    const rawParams = match[0].slice(2, -1);
    const params = rawParams.length === 0 ? [0] : rawParams.split(";").map(Number);
    applyParams(style, params);
    lastIndex = match.index + match[0].length;
  }

  const trailing = line.slice(lastIndex);
  if (trailing.length > 0) {
    const inlineStyle = styleToInline(style);
    segments.push(
      inlineStyle
        ? createElement("span", { key: `${keyPrefix}-${segmentIndex}`, style: inlineStyle }, trailing)
        : trailing,
    );
  }

  return segments.length === 1 ? segments[0] : segments;
}

export function renderAnsiText(text: string): ReactNode[] {
  const lines = text.split("\n");
  const result: ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      result.push("\n");
    }
    result.push(renderAnsiLine(lines[i]!, `l${i}`));
  }

  return result;
}
