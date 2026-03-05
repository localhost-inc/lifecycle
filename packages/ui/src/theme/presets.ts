export type ThemeAppearance = "light" | "dark" | "system";
export type ThemeResolvedAppearance = "light" | "dark";
export type ThemePreset = "lifecycle" | "nord" | "monokai";

export const themePresetOptions: Array<{ label: string; value: ThemePreset }> = [
  { label: "Lifecycle", value: "lifecycle" },
  { label: "Nord", value: "nord" },
  { label: "Monokai", value: "monokai" },
];

export const themeAppearanceOptions: Array<{ label: string; value: ThemeAppearance }> = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export function isThemeAppearance(value: unknown): value is ThemeAppearance {
  return value === "light" || value === "dark" || value === "system";
}

export function isThemePreset(value: unknown): value is ThemePreset {
  return value === "lifecycle" || value === "nord" || value === "monokai";
}
