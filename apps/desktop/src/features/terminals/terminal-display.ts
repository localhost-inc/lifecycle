export const LIFECYCLE_MONO_FONT_FAMILY = "Lifecycle Mono";
export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1.2;
export const DEFAULT_TERMINAL_RENDERER = "system";
export const TERMINAL_FONT_SIZE_MIN = 11;
export const TERMINAL_FONT_SIZE_MAX = 20;
export const TERMINAL_LINE_HEIGHT_MIN = 1;
export const TERMINAL_LINE_HEIGHT_MAX = 1.6;
export const TERMINAL_RENDERER_VALUES = ["system", "dom", "webgl"] as const;

export type TerminalRenderer = (typeof TERMINAL_RENDERER_VALUES)[number];
export type ResolvedTerminalRenderer = Exclude<TerminalRenderer, "system">;
export type ActiveTerminalRenderer = ResolvedTerminalRenderer | "canvas";
export type TerminalPlatform = "linux" | "macos" | "unknown" | "windows";
export type TerminalWebglStatus = "active" | "context-lost" | "failed" | "not-requested";

export interface TerminalFontPreset {
  description: string;
  fontFamily: string;
  id: string;
  label: string;
}

export interface TerminalRendererOption {
  description: string;
  label: string;
  value: TerminalRenderer;
}

export interface TerminalRuntimeDiagnostics {
  activeRenderer: ActiveTerminalRenderer;
  allowTransparency: boolean;
  bundledFontReady: boolean;
  configuredFontFamily: string;
  devicePixelRatio: number;
  platform: TerminalPlatform;
  requestedRenderer: TerminalRenderer;
  resolvedRenderer: ActiveTerminalRenderer;
  webglStatus: TerminalWebglStatus;
}

interface ResolveTerminalRuntimeOptionsInput {
  backgroundColor: string | null | undefined;
  platformHint?: string | null | undefined;
  renderer: TerminalRenderer | string | null | undefined;
}

const TERMINAL_SYMBOL_FALLBACKS = ['"Symbols Nerd Font Mono"', '"Noto Sans Symbols 2"'];
const QUOTED_LIFECYCLE_MONO_FONT_FAMILY = `"${LIFECYCLE_MONO_FONT_FAMILY}"`;

export const terminalRendererOptions: readonly TerminalRendererOption[] = [
  {
    value: "system",
    label: "System",
    description: "DOM on macOS, WebGL elsewhere.",
  },
  {
    value: "dom",
    label: "DOM",
    description: "Prefer compatibility and sharper text over throughput.",
  },
  {
    value: "webgl",
    label: "WebGL",
    description: "Prefer throughput and large-output performance.",
  },
] as const;

function normalizePlatformHint(platformHint: string | null | undefined): string {
  return platformHint?.trim().toLowerCase() ?? "";
}

export function detectPlatformHint(): string {
  if (typeof navigator === "undefined") {
    return "";
  }

  const userAgentDataPlatform =
    "userAgentData" in navigator &&
    typeof navigator.userAgentData === "object" &&
    navigator.userAgentData !== null &&
    "platform" in navigator.userAgentData
      ? String(navigator.userAgentData.platform)
      : undefined;

  return normalizePlatformHint(userAgentDataPlatform ?? navigator.platform ?? navigator.userAgent);
}

export function getTerminalPlatform(platformHint = detectPlatformHint()): TerminalPlatform {
  const normalized = normalizePlatformHint(platformHint);

  if (normalized.includes("mac")) {
    return "macos";
  }

  if (normalized.includes("win")) {
    return "windows";
  }

  if (
    normalized.includes("linux") ||
    normalized.includes("x11") ||
    normalized.includes("wayland")
  ) {
    return "linux";
  }

  return "unknown";
}

function buildFontStack(families: readonly string[]): string {
  return [...families, "monospace"].join(", ");
}

function getSystemTerminalFontFamilies(platformHint = detectPlatformHint()): readonly string[] {
  const platform = getTerminalPlatform(platformHint);

  if (platform === "macos") {
    return [
      '"SF Mono"',
      '"SFMono-Regular"',
      "Menlo",
      "Monaco",
      '"Apple Symbols"',
      ...TERMINAL_SYMBOL_FALLBACKS,
    ];
  }

  if (platform === "windows") {
    return [
      '"Cascadia Mono"',
      '"Cascadia Code"',
      "Consolas",
      '"Segoe UI Symbol"',
      ...TERMINAL_SYMBOL_FALLBACKS,
    ];
  }

  return [
    '"DejaVu Sans Mono"',
    '"Liberation Mono"',
    '"Noto Sans Mono"',
    ...TERMINAL_SYMBOL_FALLBACKS,
  ];
}

export function getDefaultTerminalFontFamily(platformHint = detectPlatformHint()): string {
  return buildFontStack([
    ...getSystemTerminalFontFamilies(platformHint),
    QUOTED_LIFECYCLE_MONO_FONT_FAMILY,
    '"Geist Mono"',
  ]);
}

export function getTerminalFontPresets(
  platformHint = detectPlatformHint(),
): readonly TerminalFontPreset[] {
  const platform = getTerminalPlatform(platformHint);
  const systemFontFamily = buildFontStack(getSystemTerminalFontFamilies(platformHint));
  const systemLabel =
    platform === "macos" ? "SF Mono" : platform === "windows" ? "Cascadia Mono" : "System Mono";

  return [
    {
      id: "system-mono",
      label: systemLabel,
      description: "Prefer the platform terminal stack first. Recommended for Ghostty Web.",
      fontFamily: systemFontFamily,
    },
    {
      id: "lifecycle-mono",
      label: "Lifecycle Mono",
      description: "Use the bundled terminal font first, then fall back to the platform stack.",
      fontFamily: getDefaultTerminalFontFamily(platformHint),
    },
    {
      id: "geist-mono",
      label: "Geist Mono",
      description: "Use Geist Mono first, then fall back to the bundled stack.",
      fontFamily: buildFontStack([
        '"Geist Mono"',
        QUOTED_LIFECYCLE_MONO_FONT_FAMILY,
        `"${getPrimaryTerminalFontFamily(systemFontFamily)}"`,
      ]),
    },
    {
      id: "jetbrains-mono",
      label: "JetBrains Mono",
      description: "A denser editor-style mono with bundled fallback.",
      fontFamily: buildFontStack([
        '"JetBrains Mono"',
        QUOTED_LIFECYCLE_MONO_FONT_FAMILY,
        `"${getPrimaryTerminalFontFamily(systemFontFamily)}"`,
      ]),
    },
  ];
}

export function normalizeTerminalFontFamily(
  value: string | null | undefined,
  platformHint = detectPlatformHint(),
): string {
  const trimmed = value?.trim();
  const defaultFontFamily = getDefaultTerminalFontFamily(platformHint);

  if (!trimmed || trimmed.length === 0) {
    return defaultFontFamily;
  }

  return trimmed;
}

function coerceNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizeTerminalFontSize(value: number | string | null | undefined): number {
  const numeric = coerceNumber(value, DEFAULT_TERMINAL_FONT_SIZE);
  return Math.round(clamp(numeric, TERMINAL_FONT_SIZE_MIN, TERMINAL_FONT_SIZE_MAX));
}

export function normalizeTerminalLineHeight(value: number | string | null | undefined): number {
  const numeric = coerceNumber(value, DEFAULT_TERMINAL_LINE_HEIGHT);
  return Number.parseFloat(
    clamp(numeric, TERMINAL_LINE_HEIGHT_MIN, TERMINAL_LINE_HEIGHT_MAX).toFixed(2),
  );
}

export function normalizeTerminalRenderer(
  value: TerminalRenderer | string | null | undefined,
): TerminalRenderer {
  if (typeof value === "string" && TERMINAL_RENDERER_VALUES.includes(value as TerminalRenderer)) {
    return value as TerminalRenderer;
  }

  return DEFAULT_TERMINAL_RENDERER;
}

export function resolveTerminalRenderer(
  renderer: TerminalRenderer | string | null | undefined,
  platformHint = detectPlatformHint(),
): ResolvedTerminalRenderer {
  const normalized = normalizeTerminalRenderer(renderer);
  if (normalized === "dom" || normalized === "webgl") {
    return normalized;
  }

  return getTerminalPlatform(platformHint) === "macos" ? "dom" : "webgl";
}

export function getPrimaryTerminalFontFamily(fontFamily: string): string {
  let quote: '"' | "'" | null = null;
  let head = "";

  for (const char of fontFamily) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      head += char;
      continue;
    }

    if (char === "," && !quote) {
      break;
    }

    head += char;
  }

  return head.trim().replace(/^['"]|['"]$/g, "");
}

function parseCssAlpha(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percent) ? percent / 100 : null;
  }

  const numeric = Number.parseFloat(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

export function shouldAllowTerminalTransparency(
  backgroundColor: string | null | undefined,
): boolean {
  const color = backgroundColor?.trim().toLowerCase();
  if (!color) {
    return false;
  }

  if (color === "transparent") {
    return true;
  }

  const shortHex = color.match(/^#([\da-f]{4})$/i);
  if (shortHex) {
    const alphaNibble = shortHex[1]?.[3];
    return alphaNibble !== undefined && alphaNibble.toLowerCase() !== "f";
  }

  const longHex = color.match(/^#([\da-f]{8})$/i);
  if (longHex) {
    const alphaPair = longHex[1]?.slice(6);
    return alphaPair !== undefined && alphaPair.toLowerCase() !== "ff";
  }

  const functionalAlpha = color.match(/(?:rgba|hsla)\([^)]*,\s*([0-9.]+%?)\s*\)$/i);
  if (functionalAlpha) {
    const alpha = parseCssAlpha(functionalAlpha[1] ?? "");
    return alpha !== null && alpha < 1;
  }

  const slashAlpha = color.match(/\/\s*([0-9.]+%?)\s*\)$/i);
  if (slashAlpha) {
    const alpha = parseCssAlpha(slashAlpha[1] ?? "");
    return alpha !== null && alpha < 1;
  }

  return false;
}

export function resolveTerminalRuntimeOptions(
  input: ResolveTerminalRuntimeOptionsInput,
): Pick<
  TerminalRuntimeDiagnostics,
  "allowTransparency" | "requestedRenderer" | "resolvedRenderer"
> {
  const requestedRenderer = normalizeTerminalRenderer(input.renderer);
  return {
    allowTransparency: shouldAllowTerminalTransparency(input.backgroundColor),
    requestedRenderer,
    resolvedRenderer: resolveTerminalRenderer(requestedRenderer, input.platformHint ?? undefined),
  };
}
