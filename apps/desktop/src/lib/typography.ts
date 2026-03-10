export interface FontPreset {
  description: string;
  fontFamily: string;
  id: string;
  label: string;
}

export const DEFAULT_INTERFACE_FONT_FAMILY = '"Geist", "Inter", system-ui, sans-serif';
export const DEFAULT_MONOSPACE_FONT_FAMILY =
  '"Geist Mono", "JetBrains Mono", ui-monospace, monospace';

const GENERIC_FONT_FAMILIES = new Set([
  "cursive",
  "emoji",
  "fangsong",
  "fantasy",
  "math",
  "monospace",
  "sans-serif",
  "serif",
  "system-ui",
  "ui-monospace",
  "ui-rounded",
  "ui-sans-serif",
  "ui-serif",
]);

function detectPlatformHint(): string {
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

  return (userAgentDataPlatform ?? navigator.platform ?? navigator.userAgent).trim().toLowerCase();
}

function buildFontStack(families: readonly string[]): string {
  return families.join(", ");
}

function getSystemMonospaceFontStack(platformHint = detectPlatformHint()): {
  fontFamily: string;
  label: string;
} {
  if (platformHint.includes("mac")) {
    return {
      fontFamily: buildFontStack(['"SF Mono"', '"SFMono-Regular"', "Menlo", "Monaco", "monospace"]),
      label: "SF Mono",
    };
  }

  if (platformHint.includes("win")) {
    return {
      fontFamily: buildFontStack(['"Cascadia Mono"', '"Cascadia Code"', "Consolas", "monospace"]),
      label: "Cascadia Mono",
    };
  }

  return {
    fontFamily: buildFontStack([
      '"DejaVu Sans Mono"',
      '"Liberation Mono"',
      '"Noto Sans Mono"',
      "monospace",
    ]),
    label: "System Mono",
  };
}

export function getInterfaceFontPresets(): readonly FontPreset[] {
  return [
    {
      id: "geist",
      label: "Geist",
      description: "The default interface stack.",
      fontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
    },
    {
      id: "inter",
      label: "Inter",
      description: "A neutral UI sans stack.",
      fontFamily: '"Inter", system-ui, sans-serif',
    },
    {
      id: "system",
      label: "System UI",
      description: "Prefer the platform UI font first.",
      fontFamily: "system-ui, sans-serif",
    },
  ] as const;
}

export function getMonospaceFontPresets(
  platformHint = detectPlatformHint(),
): readonly FontPreset[] {
  const systemMono = getSystemMonospaceFontStack(platformHint);

  return [
    {
      id: "geist-mono",
      label: "Geist Mono",
      description: "The default monospace stack for code and terminals.",
      fontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
    },
    {
      id: "jetbrains-mono",
      label: "JetBrains Mono",
      description: "A denser editor-style monospace stack.",
      fontFamily: '"JetBrains Mono", "Geist Mono", ui-monospace, monospace',
    },
    {
      id: "system-mono",
      label: systemMono.label,
      description: "Prefer the platform monospace stack first.",
      fontFamily: systemMono.fontFamily,
    },
  ] as const;
}

export function normalizeFontFamily(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function getPrimaryFontFamily(fontFamily: string): string {
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

export function getNativeMonospaceFontFamily(
  fontFamily: string,
  platformHint = detectPlatformHint(),
): string {
  const primaryFamily = getPrimaryFontFamily(fontFamily);
  if (!primaryFamily || GENERIC_FONT_FAMILIES.has(primaryFamily.toLowerCase())) {
    return getPrimaryFontFamily(getSystemMonospaceFontStack(platformHint).fontFamily);
  }

  return primaryFamily;
}
