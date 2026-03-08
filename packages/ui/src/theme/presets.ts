export type Theme =
  | "system"
  | "light"
  | "dark"
  | "nord-light"
  | "nord-dark"
  | "monokai-light"
  | "monokai-dark";

export type ResolvedTheme = Exclude<Theme, "system">;

export const themeOptions: Array<{ label: string; value: Theme }> = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "Nord Light", value: "nord-light" },
  { label: "Nord Dark", value: "nord-dark" },
  { label: "Monokai Light", value: "monokai-light" },
  { label: "Monokai Dark", value: "monokai-dark" },
];

const THEME_VALUES = new Set<string>(themeOptions.map((option) => option.value));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_VALUES.has(value);
}

export function themeAppearance(theme: ResolvedTheme): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  return theme.endsWith("-dark") ? "dark" : "light";
}
