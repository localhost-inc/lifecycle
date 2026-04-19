import type { TerminalColors } from "@opentui/core";

interface RgbColor {
  b: number;
  g: number;
  r: number;
}

export interface TuiTheme {
  background: string;
  border: {
    active: string;
    default: string;
    emphasis: string;
  };
  card: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  sidebar: {
    foreground: string;
    mutedForeground: string;
    selected: string;
  };
  state: {
    danger: string;
    info: string;
    neutral: string;
  };
  surface: string;
  surfaceHover: string;
  surfaceSelected: string;
}

export const defaultTuiTheme: TuiTheme = {
  background: "#171411",
  border: {
    active: "#fafaf9",
    default: "#2d2823",
    emphasis: "#23201c",
  },
  card: "#221e1a",
  foreground: "#fafaf9",
  muted: "#29241f",
  mutedForeground: "#847d73",
  sidebar: {
    foreground: "#faf8f5",
    mutedForeground: "#a39d93",
    selected: "#2c2620",
  },
  state: {
    danger: "#ef4444",
    info: "#60a5fa",
    neutral: "#57534e",
  },
  surface: "#131110",
  surfaceHover: "#1c1916",
  surfaceSelected: "#23201c",
};

export function deriveTuiTheme(colors?: TerminalColors | null): TuiTheme {
  if (!colors) {
    return defaultTuiTheme;
  }

  const background = normalizeHex(colors.defaultBackground, defaultTuiTheme.background);
  const foreground = normalizeHex(colors.defaultForeground, defaultTuiTheme.foreground);
  const danger = normalizeHex(colors.palette[9] ?? colors.palette[1], defaultTuiTheme.state.danger);
  const info = normalizeHex(colors.palette[12] ?? colors.palette[4], defaultTuiTheme.state.info);
  const neutral = normalizeHex(colors.palette[8], mixHex(background, foreground, 0.34));
  const mutedForeground = mixHex(background, foreground, 0.52);
  const sidebarMutedForeground = mixHex(background, foreground, 0.62);
  const surface = mixHex(background, foreground, 0.05);
  const card = mixHex(background, foreground, 0.08);
  const muted = mixHex(background, foreground, 0.1);
  const surfaceHover = mixHex(background, foreground, 0.12);
  const surfaceSelected = mixHex(background, foreground, 0.16);
  const borderDefault = mixHex(background, foreground, 0.18);
  const borderEmphasis = mixHex(background, foreground, 0.26);

  return {
    background,
    border: {
      active: foreground,
      default: borderDefault,
      emphasis: borderEmphasis,
    },
    card,
    foreground,
    muted,
    mutedForeground,
    sidebar: {
      foreground,
      mutedForeground: sidebarMutedForeground,
      selected: surfaceSelected,
    },
    state: {
      danger,
      info,
      neutral,
    },
    surface,
    surfaceHover,
    surfaceSelected,
  };
}

function normalizeHex(value: string | null | undefined, fallback: string): string {
  const candidate = value?.trim().toLowerCase();
  if (!candidate) {
    return fallback;
  }

  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(candidate) || /^#[0-9a-f]{3,4}$/.test(candidate)) {
    return candidate;
  }

  return fallback;
}

function mixHex(background: string, foreground: string, amount: number): string {
  const start = parseHex(background);
  const end = parseHex(foreground);
  const mixAmount = clamp01(amount);

  return toHex({
    b: mixChannel(start.b, end.b, mixAmount),
    g: mixChannel(start.g, end.g, mixAmount),
    r: mixChannel(start.r, end.r, mixAmount),
  });
}

function parseHex(value: string): RgbColor {
  const normalized = normalizeHex(value, "#000000").slice(1);

  if (normalized.length === 3 || normalized.length === 4) {
    return {
      b: Number.parseInt(`${normalized[2]}${normalized[2]}`, 16),
      g: Number.parseInt(`${normalized[1]}${normalized[1]}`, 16),
      r: Number.parseInt(`${normalized[0]}${normalized[0]}`, 16),
    };
  }

  return {
    b: Number.parseInt(normalized.slice(4, 6), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    r: Number.parseInt(normalized.slice(0, 2), 16),
  };
}

function toHex(color: RgbColor): string {
  return `#${toHexChannel(color.r)}${toHexChannel(color.g)}${toHexChannel(color.b)}`;
}

function toHexChannel(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

function mixChannel(start: number, end: number, amount: number): number {
  return Math.round(start + (end - start) * amount);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
